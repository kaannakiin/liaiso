namespace Sezzlee.AspNetCore.Caching;

public enum CacheKind { Facts, Probe }

public readonly record struct CacheKey(CallerScope Scope, CacheKind Kind, string? Subkey = null)
{
    public override string ToString()
    {
        string kind = Kind.ToString().ToLowerInvariant();
        return Subkey is null
            ? $"sezzlee:v1:{Scope.Key}:{kind}"
            : $"sezzlee:v1:{Scope.Key}:{kind}:{Subkey}";
    }
}

public interface ISezzleeCache
{
    ValueTask<string?> GetAsync(CacheKey key, CancellationToken cancellationToken);

    ValueTask SetAsync(CacheKey key, string value, TimeSpan lifetime, CancellationToken cancellationToken);

    ValueTask RemoveScopeAsync(string scopeKey, CancellationToken cancellationToken);

    ValueTask RemoveTagAsync(string tag, CancellationToken cancellationToken);

    ValueTask ClearAsync(CancellationToken cancellationToken);
}
