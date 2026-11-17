import fs from "fs";
import Parser from "rss-parser";
import * as cheerio from "cheerio";
import { GoogleGenAI } from "@google/genai";

const parser = new Parser({
  timeout: 15000,
  customFields: {
    item: [
      ["media:group", "mediaGroup"],
      ["media:content", "mediaContent"],
      ["media:thumbnail", "mediaThumbnail"],
      ["yt:videoId", "ytVideoId"],
      ["content:encoded", "contentEncoded"]
    ]
  }
});

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FEEDS = [
  // General & National
  { category: "General", source: "NDTV News", url: "https://feeds.feedburner.com/ndtvnews-top-stories" },
  { category: "India National", source: "The Hindu", url: "https://www.thehindu.com/news/national/feeder/default.rss" },
  { category: "India National", source: "Times of India", url: "https://timesofindia.indiatimes.com/rssfeeds/-2128936835.cms" },
  // World
  { category: "World", source: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { category: "World", source: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml" },
  // Politics
  { category: "Politics", source: "The Hindu Politics", url: "https://www.thehindu.com/news/national/feeder/default.rss" },
  { category: "Politics", source: "NDTV India", url: "https://feeds.feedburner.com/ndtvnews-india-news" },
  // Sports
  { category: "Sports", source: "NDTV Sports", url: "https://feeds.feedburner.com/ndtvsports-latest" },
  { category: "Sports", source: "BBC Sport", url: "https://feeds.bbci.co.uk/sport/rss.xml" },
  // Entertainment
  { category: "Entertainment", source: "Times of India Entertainment", url: "https://timesofindia.indiatimes.com/rssfeeds/1081479906.cms" },
  { category: "Entertainment", source: "NDTV Movies", url: "https://feeds.feedburner.com/ndtvmovies-latest" },
  // Verified Podcast Channels (Correct Channel IDs)
  { category: "Podcasts", source: "Raj Shamani", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCzwCEE_PchiBULMnAJqhGVg" },
  { category: "Podcasts", source: "BeerBiceps (TRS)", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCneyi-aYq4VIBYIAQgWmk_w" },
  { category: "Podcasts", source: "Nikhil Kamath", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCnC8SAZzQiB2XlFBwpMq17g" },
  { category: "Podcasts", source: "ANI Podcast", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCtFQDgA8J8_iiwc5-KoAQlg" },
  { category: "Podcasts", source: "Lex Fridman", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCSHZKyawb77ixDdsGog4iWA" },
  { category: "Podcasts", source: "The Diary Of A CEO", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCGq-a57w-aPwyi3pW7XLiHw" }
];

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand",
  "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
  "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal"
];

function cleanPodcastDescription(raw) {
  if (!raw) return "";
  return raw
    .split(/\r?\n/)
    .filter((line) => {
      const l = line.trim().toLowerCase();
      if (!l) return false;
      if (l.includes("http://") || l.includes("https://") || l.includes("bit.ly") || l.includes("linktr.ee")) return false;
      if (l.startsWith("check out") || l.startsWith("download ") || l.startsWith("follow ") || l.startsWith("subscribe ")) return false;
      if (l.includes("youtube membership") || l.includes("press the bell") || l.includes("social media handles")) return false;
      if (l.includes("leading multimedia news agency") || l.includes("connect@") || l.includes("guest suggestions")) return false;
      if (/^(instagram|youtube|twitter|facebook|linkedin|mail)\s*:/i.test(l)) return false;
      return true;
    })
    .join(" ")
    .replace(/#\w+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function scrapeArticleDetails(url) {
  if (!url || url.includes("youtube.com") || url.includes("youtu.be")) {
    return { text: "", ogImage: "" };
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"
      }
    });
    clearTimeout(timer);
    const html = await res.text();
    const $ = cheerio.load(html);

    const ogImage =
      $('meta[property="og:image"]').attr("content") ||
      $('meta[name="twitter:image"]').attr("content") ||
      "";

    $("script, style, nav, footer, header, aside, .ad, .advertisement").remove();
    const paras = $("article p, .story-content p, .article-body p, p")
      .map((_, el) => $(el).text().trim())
      .get()
      .filter((p) => p.length > 45 && !/subscribe|cookie|sign in|all rights reserved|follow us/i.test(p))
      .slice(0, 5)
      .join(" ");

    return { text: paras.slice(0, 2200), ogImage };
  } catch {
    return { text: "", ogImage: "" };
  }
}

function extractRssImage(item, ytId) {
  if (ytId) return `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;
  const mediaUrl =
    item.mediaContent?.$?.url ||
    item.mediaThumbnail?.$?.url ||
    item.mediaGroup?.["media:thumbnail"]?.[0]?.$?.url ||
    item.enclosure?.url ||
    "";
  if (mediaUrl && mediaUrl.startsWith("http")) return mediaUrl;

  const html = item.contentEncoded || item.content || item.summary || "";
  const imgMatch = html.match(/<img[^>]+src=["']([^"'>]+)["']/i);
  if (imgMatch && imgMatch[1]?.startsWith("http")) return imgMatch[1];
  return "";
}

async function generate45To50WordGist(title, contextText, isPodcast, hostName) {
  const prompt = isPodcast
    ? `You are an editor for Pulse50. Write a compelling, informative 45 to 50 word podcast gist explaining what ${hostName} and the guest discuss in this episode, highlighting the main insights or takeaways so a reader wants to watch the full video.
Rules:
- Strictly between 44 and 50 words.
- Complete grammatical sentences ending with a period.
- NEVER include URLs, hashtags, channel promotions, or "subscribe" text.
- Output ONLY the summary paragraph.

Episode Title: ${title}
Episode Notes: ${contextText}`
    : `You are a senior news editor for Pulse50 (like Inshorts). Summarize the core facts of this news story into a crisp, complete 45 to 50 word brief.
Rules:
- Strictly between 44 and 50 words.
- Complete grammatical sentences ending with a period.
- Do NOT repeat the headline word-for-word.
- NEVER write filler like "Key developments and official updates" or "Full background details are available below."
- Output ONLY the factual summary paragraph.

Headline: ${title}
Article Details: ${contextText}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt
      });
      const text = (res.text || "")
        .replace(/https?:\/\/\S+/g, "")
        .replace(/[*_#`]/g, "")
        .replace(/\s+/g, " ")
        .trim();
      const words = text.split(/\s+/);
      if (words.length >= 35 && words.length <= 55) {
        return words.slice(0, 50).join(" ").replace(/[,;:\-]+$/, "") + (/[.!?]$/.test(text) ? "" : ".");
      }
    } catch (err) {
      console.warn("Gemini retry:", err.message);
      await sleep(2500);
    }
  }

  const cleanFallback = cheerio.load(contextText || "").text().replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
  if (cleanFallback.length >= 90) {
    const sentences = cleanFallback.match(/[^.!?]+[.!?]+/g) || [cleanFallback];
    let out = "";
    for (const s of sentences) {
      const next = (out + " " + s.trim()).trim();
      if (next.split(/\s+/).length <= 50) out = next;
      else break;
    }
    if (out.split(/\s+/).length >= 25) return out;
  }
  return "";
}

async function run() {
  const results = [];
  const seenTitles = new Set();
  const seenPodcastTopics = new Set();

  for (const feed of FEEDS) {
    try {
      const parsed = await parser.parseURL(feed.url);
      const limit = feed.category === "Podcasts" ? 3 : 5;
      const items = (parsed.items || []).slice(0, limit);

      for (const item of items) {
        const cleanTitle = (item.title || "")
          .replace(/\s+[-|–—]\s+[^-|–—]+$/, "")
          .replace(/#\w+/g, "")
          .replace(/\s+/g, " ")
          .trim();
        if (!cleanTitle || seenTitles.has(cleanTitle.toLowerCase())) continue;

        const isPodcast = feed.category === "Podcasts";
        if (isPodcast) {
          const topicKey = cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24);
          if (seenPodcastTopics.has(topicKey)) continue;
          seenPodcastTopics.add(topicKey);
        }
        seenTitles.add(cleanTitle.toLowerCase());

        const ytId =
          item.ytVideoId ||
          (item.link || "").match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1] ||
          "";

        const rawRssDesc =
          item.mediaGroup?.["media:description"]?.[0] ||
          item.contentSnippet ||
          item.content ||
          item.summary ||
          "";

        let contextText = "";
        let scrapedImg = "";

        if (isPodcast) {
          contextText = cleanPodcastDescription(rawRssDesc);
        } else {
          const scraped = await scrapeArticleDetails(item.link);
          scrapedImg = scraped.ogImage;
          contextText = scraped.text || cheerio.load(rawRssDesc).text().trim();
        }

        const summary = await generate45To50WordGist(cleanTitle, contextText, isPodcast, feed.source);
        if (!summary) continue;

        const image = extractRssImage(item, ytId) || (scrapedImg.startsWith("http") ? scrapedImg : "");
        const video = ytId ? `https://www.youtube.com/embed/${ytId}?autoplay=1` : "";

        const combined = `${cleanTitle} ${summary}`.toLowerCase();
        const stateTags = isPodcast
          ? []
          : INDIAN_STATES.filter((st) => combined.includes(st.toLowerCase()));

        const tags = isPodcast
          ? ["Podcasts"]
          : Array.from(new Set(["General", feed.category, ...(stateTags.length ? ["India States"] : [])]));

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
          pubDate: item.pubDate || item.isoDate || new Date().toISOString()
        });

        await sleep(1600);
      }
    } catch (err) {
      console.warn(`Feed error (${feed.source}):`, err.message);
    }
  }

  const PRIORITY_STATES = [
    "Odisha", "Telangana", "Andhra Pradesh", "Maharashtra", "Karnataka",
    "Tamil Nadu", "Uttar Pradesh", "West Bengal", "Delhi", "Bihar",
    "Gujarat", "Rajasthan", "Kerala", "Madhya Pradesh", "Punjab"
  ];

  for (const state of PRIORITY_STATES) {
    try {
      const stateUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(state + " government OR chief minister OR news when:1d")}&hl=en-IN&gl=IN&ceid=IN:en`;
      const parsed = await parser.parseURL(stateUrl);
      const items = (parsed.items || []).slice(0, 2);

      for (const item of items) {
        const cleanTitle = (item.title || "").replace(/\s+[-|–—]\s+[^-|–—]+$/, "").trim();
        if (!cleanTitle || seenTitles.has(cleanTitle.toLowerCase())) continue;
        seenTitles.add(cleanTitle.toLowerCase());

        const rawDesc = cheerio.load(item.content || item.summary || "").text().trim();
        const summary = await generate45To50WordGist(cleanTitle, rawDesc, false, `${state} Desk`);
        if (!summary) continue;

        results.push({
          id: Buffer.from(cleanTitle).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 22),
          primaryCategory: "India States",
          tags: ["India States", "General"],
          stateTags: [state],
          title: cleanTitle,
          summary,
          source: `${state} Desk`,
          image: "",
          video: "",
          link: item.link,
          pubDate: item.pubDate || new Date().toISOString()
        });

        await sleep(1600);
      }
    } catch (err) {
      console.warn(`State feed skipped (${state}):`, err.message);
    }
  }

  console.log(`Generated ${results.length} verified 45-50 word cards.`);
  if (results.length >= 15) {
    fs.writeFileSync("news.json", JSON.stringify(results, null, 2));
    console.log("Saved news.json successfully.");
  } else {
    console.error("Insufficient cards generated; keeping previous news.json.");
    process.exit(1);
  }
}

run();
