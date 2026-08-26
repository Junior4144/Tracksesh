using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.HttpOverrides;

namespace Tracksesh.Api.Security;

/// <summary>
/// Trusting a reverse proxy's account of the original request.
///
/// Extracted from Program.cs so it can be tested. The behaviour it encodes is
/// invisible from a normal test — and, as it turned out, invisible from a local
/// smoke test too.
/// </summary>
public static class TransportSecurity
{
    /// <summary>
    /// Forwarded-header options that accept <c>X-Forwarded-Proto</c> from any
    /// caller.
    ///
    /// The two <c>Clear()</c> calls are the entire point, and they must be
    /// method calls. Written as part of an object initializer —
    /// <c>KnownIPNetworks = { }</c> — C# reads it as a collection initializer and
    /// adds nothing to the existing collection, leaving the loopback defaults
    /// in place. The middleware then compares the caller's address against those
    /// defaults, finds a real proxy is not loopback, and drops every forwarded
    /// header without a word.
    ///
    /// The failure is silent and it looks like nothing at all: the app serves
    /// fine, but believes every request arrived over plain HTTP, so
    /// <c>UseHsts</c> never emits a header. It also cannot be caught locally,
    /// because curl on the same machine *is* loopback and therefore *is*
    /// trusted — the bug only appears once a real proxy is in front.
    ///
    /// Emptying both lists is what tells the middleware to stop checking who
    /// asked. That is only safe when something is genuinely in front stripping
    /// client-supplied copies of these headers, which is what
    /// <c>Security:TrustProxyHeaders</c> asserts.
    /// </summary>
    public static ForwardedHeadersOptions ForAnyProxy()
    {
        var options = new ForwardedHeadersOptions
        {
            ForwardedHeaders = ForwardedHeaders.XForwardedProto | ForwardedHeaders.XForwardedFor,
        };

        options.KnownIPNetworks.Clear();
        options.KnownProxies.Clear();

        return options;
    }
}
