package org.booklore.service.metadata.parser;

import org.booklore.model.dto.Book;
import org.booklore.model.dto.BookMetadata;
import org.booklore.model.dto.request.FetchMetadataRequest;
import org.booklore.model.dto.settings.AppSettings;
import org.booklore.model.dto.settings.MetadataProviderSettings;
import org.booklore.model.dto.settings.MetadataPublicReviewsSettings;
import org.booklore.model.enums.MetadataProvider;
import org.booklore.service.appsettings.AppSettingService;
import org.jsoup.Jsoup;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.InputStream;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.nio.file.Paths;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
public class GoodReadsParserTest {

    @Mock
    private AppSettingService appSettingService;

    @Mock
    private BrowserProxyClient proxyClient;

    private GoodReadsParser parser;

    private String exampleSearchJsonFixture;

    private String exampleBookHtmlFixture;

    @BeforeEach
    void setUp() throws IOException {
        parser = new GoodReadsParser(
                HttpClient.newHttpClient(),
                proxyClient,
                appSettingService,
                new ObjectMapper()
        );

        exampleSearchJsonFixture = readFixture("example-search.json");
        exampleBookHtmlFixture = readFixture("example-book.html");

        lenient().when(proxyClient.isEnabled()).thenReturn(true);
    }

    private void mockSettings(boolean enabled) {
        AppSettings appSettings = new AppSettings();
        MetadataProviderSettings providerSettings = new MetadataProviderSettings();
        MetadataProviderSettings.Goodreads goodreads = new MetadataProviderSettings.Goodreads();
        goodreads.setEnabled(enabled);
        providerSettings.setGoodReads(goodreads);
        appSettings.setMetadataProviderSettings(providerSettings);

        MetadataPublicReviewsSettings.ReviewProviderConfig provider = MetadataPublicReviewsSettings.ReviewProviderConfig.builder()
                .provider(MetadataProvider.GoodReads)
                .enabled(enabled)
                .build();

        MetadataPublicReviewsSettings reviewSettings = MetadataPublicReviewsSettings.builder()
                .providers(Set.of(provider))
                .build();

        appSettings.setMetadataPublicReviewsSettings(reviewSettings);

        when(appSettingService.getAppSettings()).thenReturn(appSettings);
    }

    private String readFixture(String fixtureName) throws IOException {
        String filename = Paths.get("goodreads", fixtureName + ".fixture").toString();

        try (InputStream is = getClass().getClassLoader().getResourceAsStream(filename)) {
            assert is != null;

            return new String(is.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    @SuppressWarnings("unchecked")
    private void mockJsonSearchResponse(String urlPrefix) throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        when(proxyClient.fetchJson(
                argThat(url -> url.startsWith(urlPrefix)),
                any(TypeReference.class)
        )).thenAnswer(invocation -> {
            TypeReference<?> typeRef = invocation.getArgument(1);
            return mapper.readValue(exampleSearchJsonFixture, typeRef);
        });
    }

    private void mockHtmlBookResponse(String urlPrefix) {
        when(proxyClient.fetchDoc(
                argThat(url -> url.startsWith(urlPrefix))
        )).thenAnswer(invocation -> Jsoup.parse(exampleBookHtmlFixture));
    }

    @Test
    void testFetchMetadata_EmptyQuery() {
        Book book = Book.builder()
                .title("Test Book")
                .build();

        FetchMetadataRequest request = FetchMetadataRequest.builder()
                .build();

        List<BookMetadata> results = parser.fetchMetadata(book, request);

        assertThat(results).isNotNull();
        assertThat(results).as("Should return empty list when query is empty").isEmpty();
    }

    @Test
    void testFetchMetadata_parsesBook() throws Exception {
        Book book = Book.builder()
                .title("A Clockwork Orange")
                .build();

        FetchMetadataRequest request = FetchMetadataRequest.builder()
                .title("A Clockwork Orange")
                .author("Anthony Burgess")
                .build();

        mockSettings(true);

        mockJsonSearchResponse("https://www.goodreads.com/book/auto_complete");
        mockHtmlBookResponse("https://www.goodreads.com/book/show/");

        List<BookMetadata> results = parser.fetchMetadata(book, request);

        assertThat(results).isNotNull();
        assertThat(results).as("Should return results for real book").isNotEmpty();

        BookMetadata result = results.getFirst();
        assertThat(result.getTitle()).isEqualTo("A Clockwork Orange");
        assertThat(result.getIsbn10()).isEqualTo("0393341763");
        assertThat(result.getIsbn13()).isEqualTo("9780393341768");
        assertThat(result.getGoodreadsId()).isEqualTo("41817486");
        assertThat(result.getAuthors()).isNotNull();
        assertThat(result.getAuthors()).hasSize(1);
        assertThat(result.getAuthors().getFirst()).isEqualTo("Anthony Burgess");

        assertThat(result.getDescription()).startsWith("In Anthony Burgess's influential");
        assertThat(result.getDescription()).hasSize(511);
    }

    @Test
    void testFetchMetadata_withRateLimitingError() {
        Book book = Book.builder()
                .title("A Clockwork Orange")
                .build();

        FetchMetadataRequest request = FetchMetadataRequest.builder()
                .title("A Clockwork Orange")
                .author("Anthony Burgess")
                .build();

        when(proxyClient.fetchJson(
                argThat(url -> url.startsWith("https://www.goodreads.com/book/auto_complete")),
                any(TypeReference.class)
        )).thenThrow(new RuntimeException("Proxy error"));

        List<BookMetadata> results = parser.fetchMetadata(book, request);

        assertThat(results).isNotNull();
        assertThat(results).as("Should not return results").isEmpty();
    }
}
