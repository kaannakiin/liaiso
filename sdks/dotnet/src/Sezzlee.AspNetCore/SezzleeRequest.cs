using Microsoft.AspNetCore.Http;

namespace Sezzlee.AspNetCore;

public static class SezzleeRequest
{
    private const string FlagKey = "sezzlee.synthetic";

    public static bool IsSezzleeRequest(this HttpContext context)
    {
        ArgumentNullException.ThrowIfNull(context);
        return context.Items.ContainsKey(FlagKey);
    }

    internal static void Mark(HttpContext context) => context.Items[FlagKey] = true;
}
