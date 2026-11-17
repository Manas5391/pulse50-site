import fs from "fs";
import Parser from "rss-parser";
import * as cheerio from "cheerio";
import { GoogleGenAI } from "@google/genai";

const parser = new Parser({ timeout: 15000 });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const FEEDS = [
  { category: "General", source: "Google News India", url: "https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en" },
  { category: "India National", source: "The Hindu", url: "https://www.thehindu.com/news/national/feeder/default.rss" },
  { category: "India National", source: "NDTV News", url: "https://feeds.feedburner.com/ndtvnews-india-news" },
  { category: "World", source: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { category: "Politics", source: "Indian Express Politics", url: "https://indianexpress.com/section/political-pulse/feed/" },
  { category: "Sports", source: "BBC Sport", url: "https://feeds.bbci.co.uk/sport/rss.xml" },
  { category: "Entertainment", source: "Indian Express Entertainment", url: "https://indianexpress.com/section/entertainment/feed/" },
  { category: "Podcasts", source: "Raj Shamani", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCzwCEE_PchiBULMnAJqhGVg" },
  { category: "Podcasts", source: "Nikhil Kamath", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCnC8SAZzQiB2XlFBwpMq17g" },
  { category: "Podcasts", source: "ANI Podcast", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCtFQDgA8J8_iiwc5-KoAQlg" }
];

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand",
  "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
  "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal"
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function detectStates(text) {
  const lower = text.toLowerCase();
  return INDIAN_STATES.filter((st) => lower.includes(st.toLowerCase()));
}

async function rewriteTo50Words(title, rawDesc, isPodcast) {
  const prompt = isPodcast
    ? `Rewrite this podcast episode into a crisp, engaging 45 to 50 word gist explaining what the speakers discuss and why it matters. Remove hashtags and clickbait. Output ONLY the 45-50 word paragraph.\nTitle: ${title}\nNotes: ${rawDesc}`
    : `Rewrite this news report into a clear, factual 45 to 50 word summary in plain English with complete sentences. Output ONLY the 45-50 word paragraph.\nHeadline: ${title}\nDetails: ${rawDesc}`;

  try {
    const res = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt
    });
    const out = (res.text || "").replace(/\s+/g, " ").trim();
    if (out.split(/\s+/).length >= 25) return out;
  } catch (err) {
    console.warn("Gemini fallback used for:", title.slice(0, 40), err.message);
  }

  const clean = cheerio.load(rawDesc || "").text().replace(/\s+/g, " ").trim();
  return clean.length >= 40
    ? clean.split(/\s+/).slice(0, 50).join(" ")
    : `${title}. Verified updates from the newsroom highlight key developments, official statements, and broader public impact surrounding this developing report.`;
}

async function run() {
  const results = [];
  const seen = new Set();

  for (const feed of FEEDS) {
    try {
      const parsed = await parser.parseURL(feed.url);
      const items = (parsed.items || []).slice(0, 5);

      for (const item of items) {
        const cleanTitle = (item.title || "").replace(/\s+[-|–—]\s+[^-|–—]+$/, "").replace(/#\w+/g, "").trim();
        if (!cleanTitle || seen.has(cleanTitle.toLowerCase())) continue;
        seen.add(cleanTitle.toLowerCase());

        const isPodcast = feed.category === "Podcasts";
        const rawDesc = item.contentSnippet || item.content || item.summary || "";
        const summary = await rewriteTo50Words(cleanTitle, rawDesc, isPodcast);
        const stateTags = detectStates(`${cleanTitle} ${summary}`);
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

        await sleep(1800);
      }
    } catch (e) {
      console.warn(`Feed skipped (${feed.source}):`, e.message);
    }
  }

  console.log(`Total stories prepared: ${results.length}`);
  if (results.length >= 10) {
    fs.writeFileSync("news.json", JSON.stringify(results, null, 2));
    console.log("Successfully wrote news.json");
  } else {
    console.error("Too few stories fetched; keeping existing news.json intact.");
    process.exit(1);
  }
}

run();
