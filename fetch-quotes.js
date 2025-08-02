import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';

const CATEGORIES = ["daily", "motivational", "love", "happiness", "positive", "strength"];
const BASE_URL = "https://thequoteshub.com/api/tags/";
const PAGE_SIZE = 10;

// Add delay between requests to avoid rate limiting
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchPage(category, page = 1) {
    const url = `${BASE_URL}${category}?page=${page}&page_size=${PAGE_SIZE}`;
    console.log(`🔍 Fetching: ${url}`);
    
    try {
        const { data: html } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Cache-Control': 'max-age=0'
            },
            timeout: 10000 // 10 second timeout
        });
        
        console.log(`✅ Response received: ${html.length} characters`);
        console.log(`📊 Contains quote-container: ${html.includes('quote-container')}`);
        
        // Add delay to avoid rate limiting
        await delay(1000);
        
        return cheerio.load(html);
    } catch (error) {
        console.error(`❌ Error fetching ${url}:`, error.message);
        throw error;
    }
}

function parseQuotes($, category) {
    const results = [];
    const containers = $('.quote-container');
    
    console.log(`📝 Found ${containers.length} quote containers for ${category}`);
    
    containers.each((i, el) => {
        let text = $(el).find('.quote-text').text().trim();
        let author = $(el).find('.author').text().trim();
        if (author.startsWith("—")) author = author.replace(/^—\s*/, "");
        let tags = $(el).find('.tag').map((i, t) => $(t).text().trim()).get();

        if (text && author) {
            results.push({
                text,
                author,
                category,
                tags
            });
            console.log(`  Quote ${i + 1}: "${text.substring(0, 50)}..." by ${author}`);
        }
    });
    
    return results;
}

function getTotalPages($) {
    const pagInfo = $('.pagination-info').text() || '';
    const m = pagInfo.match(/Page\s+\d+\s+of\s+(\d+)/i);
    const totalPages = m ? parseInt(m[1], 10) : 1;
    console.log(`📄 Total pages: ${totalPages}`);
    return totalPages;
}

async function fetchQuotesForCategory(category) {
    let quotes = [];
    
    try {
        console.log(`\n🚀 Starting to fetch quotes for category: ${category}`);
        
        const $first = await fetchPage(category, 1);
        const firstPageQuotes = parseQuotes($first, category);
        quotes = quotes.concat(firstPageQuotes);
        
        const totalPages = getTotalPages($first);
        console.log(`📊 Page 1: ${firstPageQuotes.length} quotes`);

        // Fetch remaining pages (limit to reasonable number to avoid overwhelming the server)
        const maxPages = Math.min(totalPages, 5); // Limit to first 5 pages
        
        for (let page = 2; page <= maxPages; page++) {
            console.log(`📄 Fetching page ${page}/${maxPages}...`);
            const $ = await fetchPage(category, page);
            const pageQuotes = parseQuotes($, category);
            quotes = quotes.concat(pageQuotes);
            console.log(`📊 Page ${page}: ${pageQuotes.length} quotes`);
        }
        
        return quotes;
    } catch (error) {
        console.error(`❌ Error fetching category "${category}":`, error.message);
        return []; // Return empty array instead of throwing
    }
}

async function fetchAllCategories() {
    const results = {};
    
    for (const cat of CATEGORIES) {
        try {
            const quotes = await fetchQuotesForCategory(cat);
            results[cat] = quotes;
            console.log(`✅ ${cat}: ${quotes.length} quotes collected\n`);
        } catch (err) {
            console.error(`❌ Error fetching "${cat}": ${err.message}`);
            results[cat] = []; // Store empty array for failed categories
        }
    }
    
    // Write to file
    const today = new Date().toISOString().split("T")[0];
    const outputDir = "daily-quotes";
    
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
        console.log(`📁 Created directory: ${outputDir}`);
    }
    
    const outputFile = path.join(outputDir, `${today}.json`);
    fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
    
    console.log(`\n🎉 SUMMARY:`);
    for (const [category, quotes] of Object.entries(results)) {
        console.log(`   ${category}: ${quotes.length} quotes`);
    }
    console.log(`✅ Data saved to ${outputFile}`);
}

// Run the script
fetchAllCategories().catch(console.error);
