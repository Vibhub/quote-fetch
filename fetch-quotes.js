// fetch-quotes.js
import axios from 'axios';
import cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';

const CATEGORIES = ["daily", "motivational", "love", "happiness", "positive", "strength"];
const BASE_URL = "https://thequoteshub.com/api/tags/";
const PAGE_SIZE = 10; // Adjust if you know the site default

async function fetchPage(category, page = 1) {
    const url = `${BASE_URL}${category}?page=${page}&page_size=${PAGE_SIZE}`;
    const { data: html } = await axios.get(url);
    return cheerio.load(html);
}

function parseQuotes($, category) {
    const results = [];
    $('.quote-container').each((i, el) => {
        let text = $(el).find('.quote-text').text().trim();
        let author = $(el).find('.author').text().trim();
        if (author.startsWith("—")) author = author.replace(/^—\s*/, "");
        let tags = $(el).find('.tag').map((i, t) => $(t).text().trim()).get();

        results.push({
            text,
            author,
            category,
            tags
        });
    });
    return results;
}

function getTotalPages($) {
    const pagInfo = $('.pagination-info').text() || '';
    const m = pagInfo.match(/Page\s+\d+\s+of\s+(\d+)/i);
    return m ? parseInt(m[1], 10) : 1;
}

async function fetchQuotesForCategory(category) {
    let quotes = [];
    const $first = await fetchPage(category, 1);
    quotes = quotes.concat(parseQuotes($first, category));
    const totalPages = getTotalPages($first);

    for (let page = 2; page <= totalPages; page++) {
        const $ = await fetchPage(category, page);
        quotes = quotes.concat(parseQuotes($, category));
    }
    return quotes;
}

async function fetchAllCategories() {
    const results = {};
    for (const cat of CATEGORIES) {
        try {
            const quotes = await fetchQuotesForCategory(cat);
            results[cat] = quotes;
            console.log(`✅ ${cat}: ${quotes.length} quotes`);
        } catch (err) {
            console.error(`❌ Error fetching "${cat}": ${err.message}`);
        }
    }
    // Write to file
    const today = new Date().toISOString().split("T")[0];
    const outputDir = "daily-quotes";
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);
    fs.writeFileSync(
        path.join(outputDir, `${today}.json`),
        JSON.stringify(results, null, 2)
    );
    console.log(`✅ Data saved to ${outputDir}/${today}.json`);
}

fetchAllCategories();
