import fs from "fs";
import Parser from "rss-parser";
import * as cheerio from "cheerio";
import { GoogleGenAI } from "@google/genai";

const parser = new Parser({
  timeout: 15000,
  headers: { "User-Agent": "Mozilla/5.0 (compatible; Pulse50Bot/1.0)" }
});
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const FEEDS = [
  { category: "General", source: "Google News India", url: "https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en", limit: 6 },
  { category: "India National", source: "The Hindu", url: "https://www.thehindu.com/news/national/feeder/default.rss", limit: 6 },
  { category: "India National", source: "NDTV India", url: "https://feeds.feedburner.com/ndtvnews-india-news", limit: 6 },
  { category: "World", source: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml", limit: 6 },
  { category: "World", source: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml", limit: 5 },
  { category: "Politics", source: "India Politics Desk", url: "https://news.google.com/rss/search?q=India+politics+parliament+government+cabinet+when:2d&hl=en-IN&gl=IN&ceid=IN:en", limit: 8 },
  { category: "Sports", source: "BBC Sport", url: "https://feeds.bbci.co.uk/sport/rss.xml", limit: 5 },
  { category: "Sports", source: "India Sports Desk", url: "https://news.google.com/rss/search?q=India+cricket+sports+BCCI+IPL+when:2d&hl=en-IN&gl=IN&ceid=IN:en", limit: 5 },
  { category: "Entertainment", source: "Entertainment Desk", url: "https://news.google.com/rss/search?q=Bollywood+Tollywood+Indian+cinema+box+office+when:2d&hl=en-IN&gl=IN&ceid=IN:en", limit: 8 },
  { category: "Podcasts", source: "Raj Shamani", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCneyi-aYq4VIBYIAQgWmk_w", limit: 3 },
  { category: "Podcasts", source: "Lex Fridman", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCSHZKyawb77ixDdsGog4iWA", limit: 3 },
  { category: "Podcasts", source: "Huberman Lab", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UC2D2CMWXMOVWx7giW1n3LIg", limit: 3 },
  { category: "Podcasts", source: "Diary Of A CEO", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCGq-a57w-aPwyi3pW7XLiHw", limit: 3 },
  { category: "Podcasts", source: "Indian Podcasts Desk", url: "https://news.google.com/rss/search?q=podcast+episode+interview+Nikhil+Kamath+OR+Raj+Shamani+OR+ANI+Podcast+when:7d&hl=en-IN&gl=IN&ceid=IN:en", limit: 5 }
];

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand",
  "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
  "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal"
];

for (const state of INDIAN_STATES) {
  FEEDS.push({
    category: "India States",
    state,
    source: `${state} Desk`,
    url: `https://news.google.com/rss/search?q=${encodeURIComponent(state + " India news when:3d")}&hl=en-IN&gl=IN&ceid=IN:en`,
    limit: 3
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function detectStates(text, forcedState) {
  const found = new Set(forcedState ? [forcedState] : []);
  const lower = text.toLowerCase();
  for (const st of INDIAN_STATES) {
    if (lower.includes(st.toLowerCase())) found.add(st);
  }
  return Array.from(found);
}

async function fetchArticleContext(url, rawSnippet) {
  const cleanSnippet = cheerio.load(rawSnippet || "").text().replace(/\s+/g, " ").trim();
  if (!url || url.includes("news.google.com") || url.includes("youtube.com")) {
    return cleanSnippet;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Pulse50EditorialBot/1.0)" }
    });
    clearTimeout(timer);
    const html = await res.text();
    const $ = cheerio.load(html);
    $("script, style, nav, footer, header, aside, form").remove();
    const paras = $("p")
      .map((_, el) => $(el).text().trim())
      .get()
      .filter((p) => p.length > 50 && !/subscribe|cookie|sign in|all rights reserved|advertisement/i.test(p))
      .slice(0, 5)
      .join(" ");
    return paras.length > 120 ? paras.slice(0, 2000) : cleanSnippet;
  } catch {
    return cleanSnippet;
  }
}

function buildCleanFallback(title, rawContext, source) {
  let text = cheerio.load(rawContext || "").text().replace(/\s+/g, " ").trim();
  if (text.toLowerCase().startsWith(title.toLowerCase().slice(0, 25))) {
    text = text.slice(title.length).replace(/^[:\-–—.,|\s]+/, "").trim();
  }
  text = text.replace(/\b(Live Law|The Hindu|NDTV|Times of India|Indian Express|PTI|ANI)\b[:\s-]*/gi, "").trim();

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length >= 18) {
    return words.slice(0, 48).join(" ").replace(/[,;:\-–—]+$/, "") + ".";
  }
  return `Key developments and official statements regarding ${title.toLowerCase()} were reported by ${source}. Full background details and ongoing updates are available in the complete coverage below.`;
}

async function rewriteTo50Words(title, rawContext, source, isPodcast) {
  const prompt = isPodcast
    ? `Write an engaging, original 45 to 50-word podcast episode summary explaining the key topic, speaker insights, and main takeaway. Do NOT repeat the title. Output ONLY the 45-50 word paragraph.\nEpisode Title: ${title}\nNotes: ${rawContext}`
    : `Rewrite this news report into an original, factual 45 to 50-word summary in crisp English with complete sentences. Do NOT repeat the headline or mention publisher names. Output ONLY the 45-50 word paragraph.\nHeadline: ${title}\nArticle Facts: ${rawContext}`;

  try {
    const res = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt
    });
    const out = (res.text || "").replace(/\s+/g, " ").trim();
    const wc = out.split(/\s+/).filter(Boolean).length;
    if (wc >= 28 && wc <= 60) return out;
  } catch (err) {
    console.warn("Gemini fallback used:", title.slice(0, 35), err.message);
  }

  return buildCleanFallback(title, rawContext, source);
}

async function run() {
  const results = [];
  const seen = new Set();

  for (const feed of FEEDS) {
    try {
      const parsed = await parser.parseURL(feed.url);
      const items = (parsed.items || []).slice(0, feed.limit || 5);

      for (const item of items) {
        const cleanTitle = (item.title || "")
          .replace(/\s+[-|–—]\s+[^-|–—]+$/, "")
          .replace(/#\w+/g, "")
          .trim();
        if (!cleanTitle || seen.has(cleanTitle.toLowerCase())) continue;
        seen.add(cleanTitle.toLowerCase());

        const isPodcast = feed.category === "Podcasts";
        const rawSnippet = item.contentSnippet || item.content || item.summary || "";
        const context = isPodcast ? rawSnippet : await fetchArticleContext(item.link, rawSnippet);
        const summary = await rewriteTo50Words(cleanTitle, context, feed.source, isPodcast);

        const stateTags = detectStates(`${cleanTitle} ${summary}`, feed.state);
        const tags = Array.from(new Set(["General", feed.category, ...(stateTags.length ? ["India States"] : [])]));

        const ytMatch = (item.link || "").match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        const video = ytMatch ? `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1` : "";
        const image = ytMatch ? `https://i.ytimg.com/vi/${ytMatch[1]}/hqdefault.jpg` : (item.enclosure?.url || "");

        results.push({
          id: Buffer.from(cleanTitle).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 22),
          primaryCategory: feed.category,
          tags,
          stateTags,
          title: cleanTitle,
          summary,
          source: feed.source,
          image,
          video,
          link: item.link || "https://news.google.com",
          pubDate: item.pubDate || new Date().toISOString()
        });

        await sleep(1600);
      }
    } catch (e) {
      console.warn(`Feed skipped (${feed.source}):`, e.message);
    }
  }

  console.log(`Total stories prepared: ${results.length}`);
  if (results.length >= 25) {
    fs.writeFileSync("news.json", JSON.stringify(results, null, 2));
    console.log("Successfully wrote news.json");
  } else {
    console.error("Too few stories fetched; keeping existing news.json intact.");
    process.exit(1);
  }
}

run();
```[cite: 10]

4. Click **Commit changes…** (green button) → **Commit changes** to save it directly to `main`.
5. Go to **Actions** → **Auto-Update Pulse50 50-Word Feed** → **Run workflow** to verify the green checkmark (**✓**).

*(Also replace your local `C:\Users\admin\desktop\pulse50-site\update-news.js` with this exact same code so future local pushes don't overwrite it with the old `require` version.)*[cite: 5, 10]
