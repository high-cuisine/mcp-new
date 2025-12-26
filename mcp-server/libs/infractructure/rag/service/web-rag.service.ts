import { Injectable, OnModuleInit } from "@nestjs/common";
import fetch from "node-fetch";
import * as cheerio from "cheerio";

@Injectable()
export class WebRagService implements OnModuleInit {

  async onModuleInit() {
    setTimeout(() => this.search("глисты у собаки что делать"), 1500);
  }

  async search(query: string) {
    const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://duckduckgo.com/"
      }
    });

    const html = await response.text();
    const $ = cheerio.load(html);

    const results: any[] = [];

    $("a.result__a").each((_, el) => {
      const title = $(el).text().trim();
      const link = $(el).attr("href");
      const snippet = $(el).parent().find(".result__snippet").text().trim();

      if (title && link) results.push({ title, link, snippet });
    });
    const info: any[] = []
    for (const result of results.slice(0, 2)) {
      const html = await this.scrapeWebsite(result.link);
      info.push(html);
    }

    return info;
  }

  async scrapeWebsite(url: string) {
    let absoluteUrl = url;
    
    // Handle protocol-relative URLs (starting with //)
    if (url.startsWith('//')) {
      absoluteUrl = `https:${url}`;
    } else if (!url.startsWith('http://') && !url.startsWith('https://')) {
      if (url.startsWith('/l/')) {
        const urlParams = new URLSearchParams(url.split('?')[1] || '');
        const uddg = urlParams.get('uddg');
        if (uddg) {
          absoluteUrl = decodeURIComponent(uddg);
        } else {
          absoluteUrl = `https://duckduckgo.com${url}`;
        }
      } else {
        absoluteUrl = url.startsWith('/') ? `https://duckduckgo.com${url}` : `https://${url}`;
      }
    }
    
    // Extract real URL from DuckDuckGo redirect if needed
    if (absoluteUrl.includes('duckduckgo.com/l/')) {
      try {
        const urlObj = new URL(absoluteUrl);
        const uddg = urlObj.searchParams.get('uddg');
        if (uddg) {
          absoluteUrl = decodeURIComponent(uddg);
        }
      } catch (e) {
        // If URL parsing fails, try manual extraction
        const match = absoluteUrl.match(/uddg=([^&]+)/);
        if (match) {
          absoluteUrl = decodeURIComponent(match[1]);
        }
      }
    }
    
    try {
      const response = await fetch(absoluteUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        redirect: 'follow'
      });
      
      const html = await response.text();
      const $ = cheerio.load(html);
      
      // Remove script and style elements
      $('script, style, noscript, iframe').remove();
      
      // Get text content and clean it up
      let text = $('body').text() || $.text();
      
      // Clean up whitespace
      text = text.replace(/\s+/g, ' ').trim();
      text = text.replace(/\n\s*\n/g, '\n');
      
      return text;
    } catch (error) {
      console.error(`Error scraping ${absoluteUrl}:`, error);
      return '';
    }
  }

  
}
