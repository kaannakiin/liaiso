using System.Collections.Concurrent;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authorization.Policy;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Primitives;
using Sezzlee.AspNetCore;
using Sezzlee.AspNetCore.Caching;
using Sezzlee.AspNetCore.Discovery;
using Sezzlee.AspNetCore.Tools;
using Sezzlee.AspNetCore.Visibility;
using Sezzlee.AspNetCore.Visibility.Probe;
using static Sezzlee.Tests.VisibilityHost;

namespace Sezzlee.Tests;

[AttributeUsage(AttributeTargets.Method)]
internal sealed class DynamicGrantAttribute : Attribute, IAuthorizationFilter
{
    public static readonly HashSet<string> Grants = new(StringComparer.Ordinal);

    public void OnAuthorization(AuthorizationFilterContext context)
    {
        string? name = context.HttpContext.User.Identity?.Name;
        if (name is null || !Grants.Contains(name))
        {
            context.Result = new StatusCodeResult(StatusCodes.Status403Forbidden);
        }
    }
}

internal sealed class TaggingScopeResolver(ICallerScopeResolver inner) : ICallerScopeResolver
{
    public CallerScope Resolve(HttpRequest? outerRequest)
    {
        CallerScope scope = inner.Resolve(outerRequest);
        string? user = outerRequest?.Headers["X-User"].ToString();
        return string.IsNullOrEmpty(user) ? scope : new CallerScope(scope.Key, [.. scope.Tags, $"user:{user}"]);
    }
}

internal sealed class TenantScopeResolver : ICallerScopeResolver
{
    public CallerScope Resolve(HttpRequest? outerRequest)
    {
        string tenant = outerRequest?.Headers["X-Tenant"].ToString() is { Length: > 0 } value ? value : "none";
        return new CallerScope(tenant, []);
    }
}

internal sealed class ManualTimeProvider : TimeProvider
{
    private DateTimeOffset _now = DateTimeOffset.UtcNow;

    public override DateTimeOffset GetUtcNow() => _now;

    public void Advance(TimeSpan delta) => _now += delta;
}

internal sealed class RecordingCache : ISezzleeCache
{
    private readonly ConcurrentDictionary<string, string> _values = new(StringComparer.Ordinal);

    public int GetCalls;
    public int SetCalls;

    public ValueTask<string?> GetAsync(CacheKey key, CancellationToken cancellationToken)
    {
        Interlocked.Increment(ref GetCalls);
        return new ValueTask<string?>(_values.TryGetValue(key.ToString(), out string? value) ? value : null);
    }

    public ValueTask SetAsync(CacheKey key, string value, TimeSpan lifetime, CancellationToken cancellationToken)
    {
        Interlocked.Increment(ref SetCalls);
        _values[key.ToString()] = value;
        return ValueTask.CompletedTask;
    }

    public ValueTask RemoveScopeAsync(string scopeKey, CancellationToken cancellationToken)
    {
        foreach (string existing in _values.Keys.Where(k => k.StartsWith($"sezzlee:v1:{scopeKey}:", StringComparison.Ordinal)))
        {
            _values.TryRemove(existing, out _);
        }
        return ValueTask.CompletedTask;
    }

    public ValueTask RemoveTagAsync(string tag, CancellationToken cancellationToken) => ValueTask.CompletedTask;

    public ValueTask ClearAsync(CancellationToken cancellationToken)
    {
        _values.Clear();
        return ValueTask.CompletedTask;
    }
}

internal sealed class CountingVisibilityEvaluator(IVisibilityEvaluator inner) : IVisibilityEvaluator
{
    public int Calls;

    public Task<CallerFacts> ResolveAsync(
        HttpRequest? outerRequest, IReadOnlySet<string> policyNames, CancellationToken cancellationToken)
    {
        Interlocked.Increment(ref Calls);
        return inner.ResolveAsync(outerRequest, policyNames, cancellationToken);
    }
}

public sealed class CacheTests
{
    [Fact]
    public void K1_SameCarriers_SameKey()
    {
        string a = CarrierHashCallerScopeResolver.DigestInput(["Authorization"], _ => "Bearer abc");
        string b = CarrierHashCallerScopeResolver.DigestInput(["Authorization"], _ => "Bearer abc");
        Assert.Equal(a, b);
    }

    [Fact]
    public void K2_DifferentCarrierValue_DifferentKey_UndeclaredHeaderIgnored()
    {
        IOptions<SezzleeOptions> options = Options.Create(new SezzleeOptions());
        CarrierHashCallerScopeResolver resolver = new(options);

        DefaultHttpContext a = new();
        a.Request.Headers.Authorization = "Bearer abc";
        DefaultHttpContext b = new();
        b.Request.Headers.Authorization = "Bearer xyz";
        DefaultHttpContext c = new();
        c.Request.Headers.Authorization = "Bearer abc";
        c.Request.Headers["X-Undeclared"] = "irrelevant";

        string keyA = resolver.Resolve(a.Request).Key;
        string keyB = resolver.Resolve(b.Request).Key;
        string keyC = resolver.Resolve(c.Request).Key;

        Assert.NotEqual(keyA, keyB);
        Assert.Equal(keyA, keyC);
    }

    [Fact]
    public void K3_Key_Is64LowercaseHexAndContainsNoPlaintext()
    {
        string key = CarrierHashCallerScopeResolver.DigestInput(["Authorization"], _ => "Bearer super-secret-token");
        Assert.Equal(64, key.Length);
        Assert.Matches(new Regex("^[0-9a-f]{64}$"), key);
        Assert.DoesNotContain("super-secret-token", key, StringComparison.Ordinal);
    }

    [Fact]
    public async Task K4_Facts_ComputedOnceWithinLifetime()
    {
        CountingVisibilityEvaluator? counting = null;
        await using Harness host = await HostAsync(beforeSezzlee: services =>
            services.AddSingleton<IVisibilityEvaluator>(sp =>
            {
                counting = new CountingVisibilityEvaluator(new DeclarativeVisibilityEvaluator(
                    sp.GetRequiredService<SyntheticRequestFactory>()));
                return counting;
            }));
        SezzleeMetaTools tools = host.ToolsFor(Mint("alice", ordersRead: true));

        await SearchAsync(tools);
        await SearchAsync(tools);

        Assert.Equal(1, counting!.Calls);
    }

    [Fact]
    public async Task K5_SingleFlight_ParallelSearches_ProbeOnce()
    {
        await using Harness host = await ProbeHostAsync();
        SezzleeMetaTools tools = host.ToolsFor(Mint("alice"));
        Interlocked.Exchange(ref host.Probes.UndeclaredHits, 0);

        await Task.WhenAll(Enumerable.Range(0, 5).Select(_ => SearchAsync(tools)));

        Assert.Equal(1, Volatile.Read(ref host.Probes.UndeclaredHits));
    }

    [Fact]
    public async Task K5_SingleFlight_ParallelHosts_HaveIndependentProbeCounts()
    {
        await using Harness first = await ProbeHostAsync();
        await using Harness second = await ProbeHostAsync();
        SezzleeMetaTools firstTools = first.ToolsFor(Mint("alice"));
        SezzleeMetaTools secondTools = second.ToolsFor(Mint("alice"));

        await Task.WhenAll(Enumerable.Range(0, 5).SelectMany(_ =>
            new[] { SearchAsync(firstTools), SearchAsync(secondTools) }));

        Assert.Equal(1, Volatile.Read(ref first.Probes.UndeclaredHits));
        Assert.Equal(1, Volatile.Read(ref second.Probes.UndeclaredHits));
    }

    [Fact]
    public async Task K6_Ttl_IsAbsoluteAndDoesNotSlideOnTouch()
    {
        ManualTimeProvider clock = new();
        CountingVisibilityEvaluator? counting = null;
        await using Harness host = await HostAsync(
            configure: o => o.Cache.Lifetime = TimeSpan.FromSeconds(100),
            beforeSezzlee: services =>
            {
                services.AddSingleton<TimeProvider>(clock);
                services.AddSingleton<IVisibilityEvaluator>(sp =>
                {
                    counting = new CountingVisibilityEvaluator(new DeclarativeVisibilityEvaluator(
                        sp.GetRequiredService<SyntheticRequestFactory>()));
                    return counting;
                });
            });
        SezzleeMetaTools tools = host.ToolsFor(Mint("alice", ordersRead: true));

        await SearchAsync(tools);
        Assert.Equal(1, counting!.Calls);

        clock.Advance(TimeSpan.FromSeconds(50));
        await SearchAsync(tools);
        Assert.Equal(1, counting.Calls);

        clock.Advance(TimeSpan.FromSeconds(70));
        await SearchAsync(tools);
        Assert.Equal(2, counting.Calls);
    }

    [Fact]
    public async Task K7_MaxCallers_EvictsLeastRecentlyUsedScope()
    {
        await using Harness host = await ProbeHostAsync(o => o.Cache.MaxCallers = 1);
        SezzleeMetaTools alice = host.ToolsFor(Mint("alice"));
        Interlocked.Exchange(ref host.Probes.UndeclaredHits, 0);

        await SearchAsync(alice);
        await SearchAsync(host.ToolsFor(Mint("bob")));
        await SearchAsync(alice);

        Assert.Equal(3, Volatile.Read(ref host.Probes.UndeclaredHits));
    }

    [Fact]
    public async Task K8_LifetimeZero_BypassesCacheEntirely()
    {
        await using Harness host = await ProbeHostAsync(o => o.Cache.Lifetime = TimeSpan.Zero);
        SezzleeMetaTools tools = host.ToolsFor(Mint("alice"));
        Interlocked.Exchange(ref host.Probes.UndeclaredHits, 0);

        await SearchAsync(tools);
        await SearchAsync(tools);

        Assert.Equal(2, Volatile.Read(ref host.Probes.UndeclaredHits));
    }

    [Fact]
    public async Task K9_InvalidateCaller_AffectsOnlyThatCaller()
    {
        await using Harness host = await ProbeHostAsync();
        DynamicGrantAttribute.Grants.Clear();
        DynamicGrantAttribute.Grants.Add("alice");
        DynamicGrantAttribute.Grants.Add("bob");
        string aliceToken = Mint("alice");
        string bobToken = Mint("bob");
        SezzleeMetaTools aliceTools = host.ToolsFor(aliceToken);
        SezzleeMetaTools bobTools = host.ToolsFor(bobToken);

        Assert.Contains("vis_dynamic", (await SearchAsync(aliceTools)).Names);
        Assert.Contains("vis_dynamic", (await SearchAsync(bobTools)).Names);

        DynamicGrantAttribute.Grants.Clear();

        ICallerScopeResolver resolver = host.App.Services.GetRequiredService<ICallerScopeResolver>();
        ISezzleeCacheInvalidator invalidator = host.App.Services.GetRequiredService<ISezzleeCacheInvalidator>();
        DefaultHttpContext aliceContext = new();
        aliceContext.Request.Headers.Authorization = $"Bearer {aliceToken}";
        await invalidator.InvalidateCallerAsync(resolver.Resolve(aliceContext.Request));

        Assert.DoesNotContain("vis_dynamic", (await SearchAsync(aliceTools)).Names);
        Assert.Contains("vis_dynamic", (await SearchAsync(bobTools)).Names);
    }

    [Fact]
    public async Task K10_InvalidateTag_AffectsAllSessionsSharingTag()
    {
        await using Harness host = await ProbeHostAsync(beforeSezzlee: services =>
            services.AddSingleton<ICallerScopeResolver>(sp =>
                new TaggingScopeResolver(new CarrierHashCallerScopeResolver(sp.GetRequiredService<IOptions<SezzleeOptions>>()))));
        DynamicGrantAttribute.Grants.Clear();
        DynamicGrantAttribute.Grants.Add("alice");

        SezzleeMetaTools session1 = host.ToolsFor(Mint("alice", role: "session1"), ("X-User", "alice"));
        SezzleeMetaTools session2 = host.ToolsFor(Mint("alice", role: "session2"), ("X-User", "alice"));

        Assert.Contains("vis_dynamic", (await SearchAsync(session1)).Names);
        Assert.Contains("vis_dynamic", (await SearchAsync(session2)).Names);

        DynamicGrantAttribute.Grants.Clear();
        ISezzleeCacheInvalidator invalidator = host.App.Services.GetRequiredService<ISezzleeCacheInvalidator>();
        await invalidator.InvalidateTagAsync("user:alice");

        Assert.DoesNotContain("vis_dynamic", (await SearchAsync(session1)).Names);
        Assert.DoesNotContain("vis_dynamic", (await SearchAsync(session2)).Names);
    }

    [Fact]
    public async Task K11_InvalidateAll_AffectsEveryone()
    {
        await using Harness host = await ProbeHostAsync();
        DynamicGrantAttribute.Grants.Clear();
        DynamicGrantAttribute.Grants.Add("alice");
        DynamicGrantAttribute.Grants.Add("bob");

        SezzleeMetaTools aliceTools = host.ToolsFor(Mint("alice"));
        SezzleeMetaTools bobTools = host.ToolsFor(Mint("bob"));
        Assert.Contains("vis_dynamic", (await SearchAsync(aliceTools)).Names);
        Assert.Contains("vis_dynamic", (await SearchAsync(bobTools)).Names);

        DynamicGrantAttribute.Grants.Clear();
        ISezzleeCacheInvalidator invalidator = host.App.Services.GetRequiredService<ISezzleeCacheInvalidator>();
        await invalidator.InvalidateAllAsync();

        Assert.DoesNotContain("vis_dynamic", (await SearchAsync(aliceTools)).Names);
        Assert.DoesNotContain("vis_dynamic", (await SearchAsync(bobTools)).Names);
    }

    [Fact]
    public async Task K12_DoneCriterion_GrantRevokeInvalidateWithoutRestart()
    {
        await using Harness host = await ProbeHostAsync(beforeSezzlee: services =>
            services.AddSingleton<ICallerScopeResolver>(sp =>
                new TaggingScopeResolver(new CarrierHashCallerScopeResolver(sp.GetRequiredService<IOptions<SezzleeOptions>>()))));
        DynamicGrantAttribute.Grants.Clear();
        DynamicGrantAttribute.Grants.Add("alice");
        DynamicGrantAttribute.Grants.Add("bob");

        SezzleeMetaTools alice = host.ToolsFor(Mint("alice"), ("X-User", "alice"));
        SezzleeMetaTools bob = host.ToolsFor(Mint("bob"), ("X-User", "bob"));

        Assert.Contains("vis_dynamic", (await SearchAsync(alice)).Names);
        Assert.Contains("vis_dynamic", (await SearchAsync(bob)).Names);

        DynamicGrantAttribute.Grants.Remove("alice");

        Assert.Contains("vis_dynamic", (await SearchAsync(alice)).Names);
        Assert.Equal(403, await InvokeStatusAsync(alice, "vis_dynamic", new { }));

        ISezzleeCacheInvalidator invalidator = host.App.Services.GetRequiredService<ISezzleeCacheInvalidator>();
        await invalidator.InvalidateTagAsync("user:alice");

        Assert.DoesNotContain("vis_dynamic", (await SearchAsync(alice)).Names);
        Assert.Contains("vis_dynamic", (await SearchAsync(bob)).Names);
    }

    [Fact]
    public async Task K13_HostCache_RegisteredBeforeAddSezzlee_IsUsed()
    {
        RecordingCache recording = new();
        await using Harness host = await HostAsync(beforeSezzlee: services =>
            services.AddSingleton<ISezzleeCache>(recording));
        await SearchAsync(host.ToolsFor(Mint("alice", ordersRead: true)));

        Assert.True(recording.SetCalls > 0);
    }

    [Fact]
    public async Task K14_HostCache_RegisteredAfterAddSezzlee_IsUsed()
    {
        RecordingCache recording = new();
        await using Harness host = await HostAsync(afterSezzlee: services =>
            services.AddSingleton<ISezzleeCache>(recording));
        await SearchAsync(host.ToolsFor(Mint("alice", ordersRead: true)));

        Assert.True(recording.SetCalls > 0);
    }

    [Fact]
    public async Task K15_HostResolver_CollapsesTwoTokensIntoOneScope()
    {
        await using Harness host = await HostAsync(beforeSezzlee: services =>
            services.AddSingleton<ICallerScopeResolver, TenantScopeResolver>());

        SezzleeMetaTools first = host.ToolsFor(Mint("alice", ordersRead: true), ("X-Tenant", "acme"));
        SezzleeMetaTools second = host.ToolsFor(Mint("bob"), ("X-Tenant", "acme"));

        (HashSet<string> firstNames, _, _, _) = await SearchAsync(first);
        (HashSet<string> secondNames, _, _, _) = await SearchAsync(second);

        Assert.Equal(firstNames, secondNames);
    }

    [Fact]
    public async Task K16_CatalogReload_ClearsCacheAndDisabledSet_SignalsChangeToken()
    {
        CountingVisibilityEvaluator? counting = null;
        await using Harness host = await ProbeHostAsync(beforeSezzlee: services =>
            services.AddSingleton<IVisibilityEvaluator>(sp =>
            {
                counting = new CountingVisibilityEvaluator(new DeclarativeVisibilityEvaluator(
                    sp.GetRequiredService<SyntheticRequestFactory>()));
                return counting;
            }));
        SezzleeCatalogProvider catalog = host.App.Services.GetRequiredService<SezzleeCatalogProvider>();
        IProbeEvaluator probe = host.App.Services.GetRequiredService<IProbeEvaluator>();
        CatalogEntry regexEntry = catalog.Find("vis_regex")!;

        long generationBefore = catalog.Generation;
        IChangeToken tokenBefore = catalog.GetChangeToken();
        bool signaled = false;
        tokenBefore.RegisterChangeCallback(_ => signaled = true, null);

        Assert.True(probe.CanProbe(regexEntry));
        Assert.Equal(VisibilityDecision.Unknown, await probe.ProbeAsync(regexEntry, null, CancellationToken.None));
        Assert.False(probe.CanProbe(regexEntry));

        SezzleeMetaTools alice = host.ToolsFor(Mint("alice"));
        await SearchAsync(alice);
        Assert.Equal(1, counting!.Calls);

        await SearchAsync(alice);
        Assert.Equal(1, counting.Calls);

        await catalog.ReloadAsync();

        Assert.True(signaled);
        Assert.Equal(generationBefore + 1, catalog.Generation);
        Assert.True(probe.CanProbe(regexEntry));

        await SearchAsync(alice);
        Assert.Equal(2, counting.Calls);
    }

    [Fact]
    public async Task K17_InvalidateAll_DoesNotClearDisabledSetOrBumpGeneration()
    {
        await using Harness host = await ProbeHostAsync();
        SezzleeCatalogProvider catalog = host.App.Services.GetRequiredService<SezzleeCatalogProvider>();
        IProbeEvaluator probe = host.App.Services.GetRequiredService<IProbeEvaluator>();
        CatalogEntry regexEntry = catalog.Find("vis_regex")!;
        long generationBefore = catalog.Generation;

        Assert.Equal(VisibilityDecision.Unknown, await probe.ProbeAsync(regexEntry, null, CancellationToken.None));
        Assert.False(probe.CanProbe(regexEntry));

        ISezzleeCacheInvalidator invalidator = host.App.Services.GetRequiredService<ISezzleeCacheInvalidator>();
        await invalidator.InvalidateAllAsync();

        Assert.Equal(generationBefore, catalog.Generation);
        Assert.False(probe.CanProbe(regexEntry));
    }

    [Fact]
    public async Task K18_InvalidOptions_ThrowsAtStartup()
    {
        await Assert.ThrowsAsync<OptionsValidationException>(
            () => HostAsync(configure: o => o.Cache.MaxCallers = 0));
    }

    [Fact]
    public void K19_AddSezzlee_CalledTwice_RegistersOnce()
    {
        ServiceCollection services = new();
        services.AddSezzlee();
        services.AddSezzlee();

        Assert.Single(services, d => d.ServiceType == typeof(SezzleeCatalogProvider));
        Assert.Single(services, d => d.ServiceType == typeof(IAuthorizationMiddlewareResultHandler));
    }
}
