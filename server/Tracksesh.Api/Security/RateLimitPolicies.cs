namespace Tracksesh.Api.Security;

/// <summary>Named rate limit policies, so the string is written once.</summary>
public static class RateLimitPolicies
{
    /// <summary>
    /// For endpoints that verify a password, and can therefore be used to guess
    /// one. Far tighter than the global limit.
    /// </summary>
    public const string PasswordCheck = "password-check";
}
