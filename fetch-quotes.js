import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';

const CATEGORIES = ["Daily", "Wanderlust", "Motivational", "Love", "Happiness", "Positive", "Strength"];
const BASE_URL = "https://thequoteshub.com/api/tags/";
const MAX_QUOTES_PER_CATEGORY = 30;
const PAGE_SIZE = 10;

// Add delay between requests to avoid rate limiting
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Generate random page numbers to fetch for variety
function getRandomPages(totalPages, maxQuotesNeeded) {
    const pagesNeeded = Math.ceil(maxQuotesNeeded / PAGE_SIZE);
    const availablePages = Math.min(totalPages, 20); // Limit to first 20 pages for performance
    
    if (pagesNeeded >= availablePages) {
        return Array.from({length: availablePages}, (_, i) => i + 1);
    }
    
    // Generate random unique page numbers
    const pages = new Set();
    while (pages.size < pagesNeeded) {
        const randomPage = Math.floor(Math.random() * availablePages) + 1;
        pages.add(randomPage);
    }
    
    return Array.from(pages).sort((a, b) => a - b);
}

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
        
        // Add delay to avoid rate limiting
        await delay(800);
        
        return cheerio.load(html);
    } catch (error) {
        console.error(`❌ Error fetching ${url}:`, error.message);
        throw error;
    }
}

function parseQuotes($, category) {
    const results = [];
    const containers = $('.quote-container');
    
    containers.each((i, el) => {
        let text = $(el).find('.quote-text').text().trim();
        let author = $(el).find('.author').text().trim();
        if (author.startsWith("—")) author = author.replace(/^—\s*/, "");
        let tags = $(el).find('.tag').map((i, t) => $(t).text().trim()).get();

        if (text && author) {
            // Create unique identifier for deduplication
            const quoteId = `${text.toLowerCase().replace(/[^\w\s]/g, '').substring(0, 50)}_${author.toLowerCase()}`;
            
            results.push({
                id: quoteId,
                text,
                author,
                category,
                tags
            });
        }
    });
    
    return results;
}

function getTotalPages($) {
    const pagInfo = $('.pagination-info').text() || '';
    const m = pagInfo.match(/Page\s+\d+\s+of\s+(\d+)/i);
    const totalPages = m ? parseInt(m[1], 10) : 1;
    console.log(`📄 Total pages available: ${totalPages}`);
    return totalPages;
}

function removeDuplicates(quotes) {
    const seen = new Set();
    const unique = [];
    
    for (const quote of quotes) {
        if (!seen.has(quote.id)) {
            seen.add(quote.id);
            unique.push(quote);
        }
    }
    
    return unique;
}

function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

async function fetchQuotesForCategory(category) {
    let allQuotes = [];
    
    try {
        console.log(`\n🚀 Starting to fetch quotes for category: ${category}`);
        
        // First, get the first page to determine total pages
        const $first = await fetchPage(category, 1);
        const firstPageQuotes = parseQuotes($first, category);
        allQuotes = allQuotes.concat(firstPageQuotes);
        
        const totalPages = getTotalPages($first);
        console.log(`📊 Page 1: ${firstPageQuotes.length} quotes`);

        // If we need more quotes, fetch from random pages
        if (allQuotes.length < MAX_QUOTES_PER_CATEGORY && totalPages > 1) {
            const quotesNeeded = MAX_QUOTES_PER_CATEGORY - allQuotes.length;
            const randomPages = getRandomPages(totalPages, quotesNeeded);
            
            // Remove page 1 since we already fetched it
            const remainingPages = randomPages.filter(page => page !== 1);
            
            console.log(`🎲 Fetching random pages: [${remainingPages.join(', ')}]`);
            
            for (const page of remainingPages) {
                if (allQuotes.length >= MAX_QUOTES_PER_CATEGORY) break;
                
                console.log(`📄 Fetching page ${page}...`);
                const $ = await fetchPage(category, page);
                const pageQuotes = parseQuotes($, category);
                allQuotes = allQuotes.concat(pageQuotes);
                console.log(`📊 Page ${page}: ${pageQuotes.length} quotes (total: ${allQuotes.length})`);
            }
        }
        
        // Remove duplicates
        const uniqueQuotes = removeDuplicates(allQuotes);
        console.log(`🔄 After deduplication: ${uniqueQuotes.length} unique quotes`);
        
        // Shuffle and limit to MAX_QUOTES_PER_CATEGORY
        const shuffledQuotes = shuffleArray(uniqueQuotes);
        const finalQuotes = shuffledQuotes.slice(0, MAX_QUOTES_PER_CATEGORY);
        
        // Remove the 'id' field from final output
        const cleanQuotes = finalQuotes.map(({id, ...quote}) => quote);
        
        console.log(`✨ Final selection: ${cleanQuotes.length} quotes`);
        return cleanQuotes;
        
    } catch (error) {
        console.error(`❌ Error fetching category "${category}":`, error.message);
        return []; // Return empty array instead of throwing
    }
}

async function fetchAllCategories() {
    const results = {};
    
    console.log(`🎯 Target: ${MAX_QUOTES_PER_CATEGORY} unique quotes per category\n`);
    
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
    
    console.log(`\n🎉 FINAL SUMMARY:`);
    let totalQuotes = 0;
    for (const [category, quotes] of Object.entries(results)) {
        console.log(`   ${category}: ${quotes.length} quotes`);
        totalQuotes += quotes.length;
    }
    console.log(`   TOTAL: ${totalQuotes} quotes`);
    console.log(`✅ Data saved to ${outputFile}`);
}

// Run the script
fetchAllCategories().catch(console.error);
