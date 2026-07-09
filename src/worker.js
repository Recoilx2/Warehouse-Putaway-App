export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. Intercept explicit API route calls
    if (url.pathname === "/api/extract") {
      
      // Handle Preflight CORS Requests
      if (request.method === "OPTIONS") {
        return new Response(null, {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        });
      }

      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
      }

      try {
        const { image_base64 } = await request.json();
        if (!image_base64) {
          return new Response(JSON.stringify({ error: "Missing image payload" }), { status: 400 });
        }

        // Send payload to OpenRouter
        const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/emeraldocean/Warehouse-Putaway-App",
            "X-Title": "Yeti Putaway Web Scanner"
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: "Read the text on this warehouse label carefully. Extract and return the entire alphanumeric string, including all words, numbers, and hyphens (e.g., 'RAMBLER-20-NAVY'). Do not truncate or cut off the text. Return ONLY the raw text string. No intro, no closing."
                  },
                  {
                    type: "image_url",
                    image_url: { url: `data:image/jpeg;base64,${image_base64}` }
                  }
                ]
              }
            ],
            max_tokens: 100
          })
        });

        const aiData = await openRouterResponse.json();
        if (aiData.error) {
          return new Response(JSON.stringify({ error: aiData.error.message }), { 
            status: 500,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
          });
        }

        const extractedText = aiData.choices[0].message.content.trim();
        return new Response(JSON.stringify({ text: extractedText }), {
          status: 200,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });

      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
    }

    // 2. CRITICAL FALLBACK: If it's not the API endpoint, fetch the static asset (index.html)
    return env.ASSETS.fetch(request);
  }
};