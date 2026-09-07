import java.io.IOException;
import java.math.BigInteger;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class InstagramUnliker {

    private static final String USER_AGENT =
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36";
    private static final String APP_ID = "936619743392459";
    private static final String ASBD_ID = "359341";
    private static final String LSD = "g8HgGw5BNu0tuh9aLYVmlJ";
    private static final String CSRF_TOKEN = "Q828Vt70h3bmqQbda8aIYF7U3WmGwTI6";
    private static final String ACTOR_ID = "17841414649173776";
    private static final String FB_DTSG = "NAfyKrwo2dGm6zOVQIkEsLZGv7JYhUytGFZny2MwfZ8PUo7RwAOVrqA:17843671327157124:1788779364";
    private static final String JAZOEST = "26451";
    private static final String DOC_ID = "27345296031770102";

    private static final String COOKIES =
            "datr=d42-ae9aPA3NUV8zIFVk8HrN; ig_did=E62F7063-5493-47F0-9EEF-E6A9888823C3; mid=ab6NdwAEAAHX1p7Vu6EjzstYEvNl; ds_user_id=14830208305; ps_l=1; ps_n=1; csrftoken=Q828Vt70h3bmqQbda8aIYF7U3WmGwTI6; wd=555x951; sessionid=14830208305%3ANfVOWDgcXrDMXl%3A2%3AAYhCw3ZPmAUziRNf8IBHl6C0Gh9GLZEghxwqBE8OXg; rur=RCD%2C17841414649173776%2C1789989115%3A01ffd100e21dd15812f7fa104f425c188f2ba75bacad5bdce71caf0acd21bfcbd5673fa7";

    public static BigInteger codeToMediaId(String urlOrCode) {
        Pattern pattern = Pattern.compile("/(?:p|reel|tv)/([A-Za-z0-9_-]+)");
        Matcher matcher = pattern.matcher(urlOrCode);
        String code = matcher.find() ? matcher.group(1) : urlOrCode.trim().replaceAll("^/+|/+$", "");

        String charmap = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
        BigInteger id = BigInteger.ZERO;
        BigInteger base = BigInteger.valueOf(64);

        for (int i = 0; i < code.length(); i++) {
            char c = code.charAt(i);
            int index = charmap.indexOf(c);
            if (index == -1) continue;
            id = id.multiply(base).add(BigInteger.valueOf(index));
        }
        return id;
    }

    public static void main(String[] args) throws Exception {
        String reelUrl = "https://www.instagram.com/reel/Dc94zYriMa4/";
        BigInteger mediaId = codeToMediaId(reelUrl);

        System.out.println("==================================================");
        System.out.println("Instagram GraphQL Reel Unliker (Java 21)");
        System.out.println("==================================================");
        System.out.println("Target Reel URL:     " + reelUrl);
        System.out.println("Calculated Media ID: " + mediaId);
        System.out.println("Actor ID:            " + ACTOR_ID);
        System.out.println("GraphQL doc_id:      " + DOC_ID);
        System.out.println("==================================================\n");

        HttpClient client = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_2)
                .connectTimeout(Duration.ofSeconds(15))
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();

        executeGraphQLUnlike(client, mediaId.toString());
    }

    private static void executeGraphQLUnlike(HttpClient client, String mediaId) {
        String url = "https://www.instagram.com/api/graphql";

        Map<String, String> form = new LinkedHashMap<>();
        form.put("av", ACTOR_ID);
        form.put("__d", "www");
        form.put("__user", "0");
        form.put("__a", "1");
        form.put("__req", "1c");
        form.put("__hs", "20703.HYP:instagram_web_pkg.2.1...0");
        form.put("dpr", "2");
        form.put("__ccg", "GOOD");
        form.put("__rev", "1046934385");
        form.put("__s", "nxu0z4:i4ld6o:574azy");
        form.put("__hsi", "7682748963931492866");
        form.put("__dyn", "7xeUjG1mxu1syaxG4Vp41twpUnwgU7SbzEdF8vyUco2qwJyEiw50x609vCwjE1EEc87m0yE462mcw5Mx62G5UswoEcE7O2l0Fwqo5W1yw9O1lwxwQzXwae4UaEW2G0AEco5G0zK5o4q0HU420k62-azo7u3C2u2J0bS1LyUaUbGxK3R08-269wr84-6o5p389oed6goK10xKi2qi7E5y4UrwlE2xyVrx60jy7EGq2Kq11whE984O0XEdoCQbwhU");
        form.put("__csr", "jN47c9WPPZsci96ktfPl_Ze8jlFKAkBj3cJbnHqsjYQLJblRi-KAiIxSEBx16Gh2AP6K4mrllKz8CIrSHrGqIJkOQoHW8BGKm9SriXDsBlF9rGivCKBAjIHgkBvXihUxaVHx2mt7hHAzaDxWEyKm8xa9ypF8jyK9Gdymu8Ay8CjADzAAcByryHG8CG9GEWt6CAxa7d5Az8yhejogKh2Gw_K4UjDCgBei49Xm3-UgBwNG06n801jvoO6U0ubAgdIV82Mwba3R01xa05M81DrU6BwNwSg1wExq203Dw8VxK1mgaU0xR4xS1Jg4ok9wPxS0gzhqwEKlw2Z984tw0UQw3cE0qkw0wdyE0_i2-pS9y8x02UoG0R80mnw1ha");
        form.put("__hsdp", "gjB0NllsescsiO7FFJAONy49W8PA_myFsEwu7Y8U9k5a5mt1Cugi4C4A2O69p-cEw2jxIw4Z286C5SSVU-i1iGQ985Umxq7UmwdeUb85q2qEtxm4WwrUjw8-13xu5K12waCEO261pgS4awnFU1--09JwPw5Fw3iotwbu3y1Jw1CG0g-2y0FO1q1mw2X8a81dElwgU0zKm0fmw7NwXw4_CFk0_6");
        form.put("__hblp", "0CCwxw9i79uq2Sfz8O2inyuawoVUO4K4UyeAz5HyudFUko42i26u2a6mcg6bwkaVUliAGfjwxy8kxaGxa4Vrz8HVUK8BAxq78Om3S2O7kfBKUb84KawCGfzolxeKfgZ0iUjwXxN0yghw-Axt38zwgEyE2siyK9F1e2268Ku6EgF38y17DwSw74U3-wnU5i1hxi498f98bE4No12EW1hwOw62z81d8twZwuoe86S0fvw2voO1Nw9S5oixSiawPwhi7zE8EcU7G0ji0jO2y1hwkU2cK5ofXyU26w9a0Q84im0Ko0I61qw-wZU3twl8G3i3K3a0O88UuhGl0s82bo");
        form.put("__sjsp", "gjB0NllsYn4scsiS8FFJAONy49W8PA_myFsEwu7Y8wDgtRgx1Cucx9w");
        form.put("__comet_req", "7");
        form.put("fb_dtsg", FB_DTSG);
        form.put("jazoest", JAZOEST);
        form.put("lsd", LSD);
        form.put("__spin_r", "1046934385");
        form.put("__spin_b", "trunk");
        form.put("__spin_t", "1788779386");
        form.put("__crn", "comet.igweb.PolarisFeedRoute");
        form.put("fb_api_caller_class", "RelayModern");
        form.put("fb_api_req_friendly_name", "usePolarisLikeMediaXIGUnlikeMutation");
        form.put("server_timestamps", "true");
        form.put("doc_id", DOC_ID);

        String variablesJson = String.format(
                "{\"input\":{\"actor_id\":\"%s\",\"client_mutation_id\":\"1\",\"media_id\":\"%s\"}}",
                ACTOR_ID, mediaId
        );
        form.put("variables", variablesJson);

        String formData = buildFormData(form);

        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofSeconds(15))
                    .header("User-Agent", USER_AGENT)
                    .header("X-IG-App-ID", APP_ID)
                    .header("X-ASBD-ID", ASBD_ID)
                    .header("X-FB-Friendly-Name", "usePolarisLikeMediaXIGUnlikeMutation")
                    .header("X-FB-LSD", LSD)
                    .header("X-CSRFToken", CSRF_TOKEN)
                    .header("Cookie", COOKIES)
                    .header("Referer", "https://www.instagram.com/")
                    .header("Origin", "https://www.instagram.com")
                    .header("Sec-Fetch-Site", "same-origin")
                    .header("Sec-Fetch-Mode", "cors")
                    .header("Sec-Fetch-Dest", "empty")
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .header("Accept", "*/*")
                    .POST(HttpRequest.BodyPublishers.ofString(formData))
                    .build();

            System.out.println("Executing POST to " + url + " ...");
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());

            System.out.println("HTTP Status Code: " + response.statusCode());
            String body = response.body();

            System.out.println("Full Response Body:\n" + body);

            if (response.statusCode() == 200 && body.contains("\"data\"")) {
                System.out.println("\n🎉🎉🎉 SUCCESS: Reel " + mediaId + " unliked successfully! 🎉🎉🎉");
            } else if (response.statusCode() == 200 && body.contains("\"errors\"")) {
                System.out.println("\nGraphQL reported error: " + body);
            }
        } catch (Exception e) {
            System.out.println("Error during execution: " + e.toString());
            e.printStackTrace(System.out);
        }
    }

    private static String buildFormData(Map<String, String> data) {
        StringBuilder builder = new StringBuilder();
        for (Map.Entry<String, String> entry : data.entrySet()) {
            if (builder.length() > 0) {
                builder.append("&");
            }
            builder.append(URLEncoder.encode(entry.getKey(), StandardCharsets.UTF_8));
            builder.append("=");
            builder.append(URLEncoder.encode(entry.getValue(), StandardCharsets.UTF_8));
        }
        return builder.toString();
    }
}
