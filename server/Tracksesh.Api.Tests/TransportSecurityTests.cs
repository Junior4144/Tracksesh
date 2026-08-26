// ForwardedHeadersOptions is in .Builder; only the ForwardedHeaders enum is in
// .HttpOverrides. Program.cs gets both from the web SDK's implicit usings; this
// project is a plain library and has to say so.
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.HttpOverrides;
using Tracksesh.Api.Security;

namespace Tracksesh.Api.Tests;

/// <summary>
/// That the forwarded-header options actually trust the proxy in front.
///
/// This exists because the obvious way to write it silently doesn't work.
/// `new ForwardedHeadersOptions { KnownIPNetworks = { }, KnownProxies = { } }`
/// compiles, reads as "no known proxies", and leaves both collections holding
/// their loopback defaults — so a real proxy's address fails the check and every
/// forwarded header is dropped.
///
/// Nothing about the running app looks wrong when that happens. It serves
/// normally; it just believes every request arrived over plain HTTP, and so
/// never sends Strict-Transport-Security. It cannot be caught by testing
/// locally either, because a request from the same machine is loopback and
/// therefore trusted by the very defaults that are the problem. It took a
/// deployment behind a real load balancer to surface it, which is exactly the
/// kind of thing worth pinning down here instead.
/// </summary>
public sealed class TransportSecurityTests
{
    [Fact]
    public void Trusts_a_proxy_at_any_address()
    {
        var options = TransportSecurity.ForAnyProxy();

        // Non-empty means the middleware will check the caller's address against
        // this list and reject anything not on it — which, behind a load
        // balancer on an arbitrary private address, is everything.
        Assert.Empty(options.KnownIPNetworks);
        Assert.Empty(options.KnownProxies);
    }

    [Fact]
    public void Reads_the_scheme_and_the_client_address()
    {
        var options = TransportSecurity.ForAnyProxy();

        // X-Forwarded-Proto is what makes Request.IsHttps true behind a proxy,
        // and that is what UseHsts keys on. X-Forwarded-For is what makes the
        // rate limiter's fallback partition mean anything.
        Assert.True(options.ForwardedHeaders.HasFlag(ForwardedHeaders.XForwardedProto));
        Assert.True(options.ForwardedHeaders.HasFlag(ForwardedHeaders.XForwardedFor));
    }

    /// <summary>
    /// Pins the language behaviour the bug relied on, so the next person to
    /// "tidy" the Clear() calls into an initializer sees why they can't.
    /// </summary>
    [Fact]
    public void Collection_initializer_syntax_would_not_have_cleared_anything()
    {
        var written_as_an_initializer = new ForwardedHeadersOptions
        {
            ForwardedHeaders = ForwardedHeaders.XForwardedProto,
            KnownProxies = { },
        };

        Assert.NotEmpty(written_as_an_initializer.KnownProxies);
    }
}
