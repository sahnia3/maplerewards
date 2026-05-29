package service

import (
	"fmt"
	"net"
	"net/http"
	"syscall"
	"time"
)

// SSRF guard for server-side fetchers that pull externally-influenced URLs
// (LLM-extracted promo sources, issuer pages). The check runs at DIAL time —
// after DNS resolution — so it also defeats DNS rebinding and applies to every
// hop of a redirect chain (the same Transport dials each one).

// blockedDialIP reports whether a resolved IP must not be connected to:
// loopback, private (RFC1918 / ULA fc00::/7), link-local (incl. the
// 169.254.169.254 cloud-metadata endpoint), unspecified, or multicast.
func blockedDialIP(ip net.IP) bool {
	return ip == nil || ip.IsLoopback() || ip.IsPrivate() ||
		ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
		ip.IsUnspecified() || ip.IsMulticast()
}

// ssrfSafeDialControl is a net.Dialer.Control hook that refuses to connect to
// a non-public address. address is the post-resolution host:port.
func ssrfSafeDialControl(network, address string, _ syscall.RawConn) error {
	host, _, err := net.SplitHostPort(address)
	if err != nil {
		return fmt.Errorf("ssrf guard: bad dial address %q: %w", address, err)
	}
	if ip := net.ParseIP(host); blockedDialIP(ip) {
		return fmt.Errorf("ssrf guard: refusing to connect to non-public address %q", address)
	}
	return nil
}

// newSSRFSafeClient returns an *http.Client that will not connect to private/
// internal addresses, for fetching externally-influenced URLs without exposing
// internal services or cloud metadata.
func newSSRFSafeClient(timeout time.Duration) *http.Client {
	dialer := &net.Dialer{Timeout: 10 * time.Second, Control: ssrfSafeDialControl}
	return &http.Client{
		Timeout: timeout,
		Transport: &http.Transport{
			DialContext:           dialer.DialContext,
			ForceAttemptHTTP2:     true,
			MaxIdleConns:          10,
			IdleConnTimeout:       30 * time.Second,
			TLSHandshakeTimeout:   10 * time.Second,
			ExpectContinueTimeout: 1 * time.Second,
		},
	}
}
