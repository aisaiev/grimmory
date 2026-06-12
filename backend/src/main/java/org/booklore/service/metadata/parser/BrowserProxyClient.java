package org.booklore.service.metadata.parser;

import lombok.extern.slf4j.Slf4j;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

import java.util.Map;

@Slf4j
@Component
public class BrowserProxyClient {

    private final boolean enabled;
    private final RestClient restClient;
    private final ObjectMapper objectMapper;

    public BrowserProxyClient(
            @Value("${browser.proxy.enabled:true}") boolean enabled,
            @Value("${browser.proxy.url:http://localhost:7350}") String proxyUrl,
            ObjectMapper objectMapper
    ) {
        this.enabled = enabled;
        this.restClient = enabled ? RestClient.builder().baseUrl(proxyUrl).build() : null;
        this.objectMapper = objectMapper;
        log.info("Browser proxy enabled: {}", enabled);
    }

    public boolean isEnabled() {
        return enabled;
    }

    public Document fetchDoc(String url) {
        if (!enabled) {
            throw new IllegalStateException("Browser proxy is disabled");
        }
        ProxyResponse response = doFetch(url, "html");
        log.info("Proxied URL resolved to: {}", response.url());
        return Jsoup.parse(response.content());
    }

    public <T> T fetchJson(String url, TypeReference<T> typeReference) {
        if (!enabled) {
            throw new IllegalStateException("Browser proxy is disabled");
        }
        ProxyResponse response = doFetch(url, "json");
        try {
            return objectMapper.readValue(response.content(), typeReference);
        } catch (Exception e) {
            throw new RuntimeException("Failed to parse JSON response from proxy", e);
        }
    }

    private ProxyResponse doFetch(String url, String type) {
        log.debug("Proxy fetch: type={} url={}", type, url);
        try {
            ProxyResponse response = restClient.post()
                    .uri("/fetch")
                    .body(Map.of("url", url, "type", type))
                    .retrieve()
                    .body(ProxyResponse.class);

            if (response == null) {
                throw new RuntimeException("Proxy returned empty response");
            }
            return response;
        } catch (Exception e) {
            log.error("Proxy request failed for url: {}", url, e);
            throw new RuntimeException("Browser proxy request failed: " + e.getMessage(), e);
        }
    }

    private record ProxyResponse(String content, String url) {}
}
