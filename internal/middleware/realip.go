package middleware

import (
	"net"
	"net/http"
	"strings"
)

// TrustedProxyRealIP rewrites r.RemoteAddr to the client's real IP, but ONLY
// when the immediate TCP peer is in trustedCIDRs. Chi's default middleware.RealIP
// trusts X-Forwarded-For from ANY peer, which lets attackers spoof their IP
// to bypass rate limiting and per-IP access controls.
//
// trustedCIDRs is parsed once at startup. Common values:
//
//   - Direct-to-internet: pass nil (XFF is never trusted; peer IP is used).
//   - Behind Cloudflare:  pass Cloudflare's published IP ranges.
//   - Behind ALB/Nginx:   pass the load balancer's subnet (e.g. 10.0.0.0/8).
//
// The header trust is the only IP source we change; downstream code can keep
// reading r.RemoteAddr as the canonical client identifier.
func TrustedProxyRealIP(trustedCIDRs []string) func(http.Handler) http.Handler {
	nets := make([]*net.IPNet, 0, len(trustedCIDRs))
	for _, c := range trustedCIDRs {
		c = strings.TrimSpace(c)
		if c == "" {
			continue
		}
		_, n, err := net.ParseCIDR(c)
		if err == nil && n != nil {
			nets = append(nets, n)
		}
	}

	isTrusted := func(host string) bool {
		if len(nets) == 0 {
			return false
		}
		ip := net.ParseIP(host)
		if ip == nil {
			return false
		}
		for _, n := range nets {
			if n.Contains(ip) {
				return true
			}
		}
		return false
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			peerHost, _, err := net.SplitHostPort(r.RemoteAddr)
			if err != nil {
				peerHost = r.RemoteAddr
			}

			if isTrusted(peerHost) {
				if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
					if parts := strings.Split(xff, ","); len(parts) > 0 {
						if ip := strings.TrimSpace(parts[0]); ip != "" && net.ParseIP(ip) != nil {
							r.RemoteAddr = ip
						}
					}
				} else if xri := strings.TrimSpace(r.Header.Get("X-Real-IP")); xri != "" && net.ParseIP(xri) != nil {
					r.RemoteAddr = xri
				}
			} else {
				// Untrusted peer — use the TCP peer IP, never the header.
				r.RemoteAddr = peerHost
			}

			next.ServeHTTP(w, r)
		})
	}
}
