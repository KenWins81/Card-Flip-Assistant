const express = require('express');
const cors = require('cors');
const axios = require('axios');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Configuration
const CONFIG = {
  ebay: {
    appId: process.env.EBAY_APP_ID,
    certId: process.env.EBAY_CERT_ID,
    devId: process.env.EBAY_DEV_ID,
    endpoint: 'https://svcs.ebay.com/services/search/FindingService/v1'
  },
  email: {
    service: 'gmail', // or any SMTP service
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
    alertTo: process.env.ALERT_EMAIL
  },
  scanning: {
    intervalMinutes: parseInt(process.env.SCAN_INTERVAL_MINUTES) || 15, // How often to scan for new opportunities
    minProfit: 30, // Minimum profit to alert
    minConfidence: 70 // Minimum confidence score to alert
  }
};

// Email transporter
const emailTransporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: CONFIG.email.user,
    pass: CONFIG.email.pass
  },
  tls: {
    rejectUnauthorized: false
  },
  connectionTimeout: 10000, // 10 seconds
  greetingTimeout: 10000,
  socketTimeout: 10000
});

// In-memory storage (will move to database)
let opportunities = [];
let purchases = [];
let alertHistory = [];

// ========================================
// EBAY API FUNCTIONS
// ========================================

async function searchEbayListings(keywords, priceMin, priceMax, sortOrder = 'PricePlusShippingLowest') {
  try {
    const params = {
      'OPERATION-NAME': 'findItemsAdvanced',
      'SERVICE-VERSION': '1.0.0',
      'SECURITY-APPNAME': CONFIG.ebay.appId,
      'RESPONSE-DATA-FORMAT': 'JSON',
      'REST-PAYLOAD': true,
      'keywords': keywords,
      'paginationInput.entriesPerPage': 100,
      'sortOrder': sortOrder,
      'itemFilter(0).name': 'MinPrice',
      'itemFilter(0).value': priceMin,
      'itemFilter(1).name': 'MaxPrice',
      'itemFilter(1).value': priceMax,
      'itemFilter(2).name': 'ListingType',
      'itemFilter(2).value': 'AuctionWithBIN',
      'itemFilter(3).name': 'Condition',
      'itemFilter(3).value': 'New',
      'itemFilter(4).name': 'HideDuplicateItems',
      'itemFilter(4).value': true
    };

    const response = await axios.get(CONFIG.ebay.endpoint, { params });
    
    if (response.data.findItemsAdvancedResponse?.[0]?.searchResult?.[0]?.item) {
      return response.data.findItemsAdvancedResponse[0].searchResult[0].item;
    }
    
    return [];
  } catch (error) {
    console.error('eBay API Error:', error.message);
    return [];
  }
}

// ========================================
// PRICING & ANALYSIS FUNCTIONS
// ========================================

async function getMarketData(cardName, year, set, variant) {
  // This would integrate with 130point, PriceCharting, etc.
  // For now, simulating the data structure
  
  try {
    // Example: Query external pricing APIs
    // const priceData = await axios.get(`https://api.130point.com/sales?card=${cardName}`);
    
    // Simulated market data
    return {
      recentSales: [],
      avgPrice: 0,
      highPrice: 0,
      lowPrice: 0,
      salesVolume: 0,
      trend: 'stable' // 'up', 'down', 'stable'
    };
  } catch (error) {
    console.error('Market data error:', error.message);
    return null;
  }
}

function calculateGradingPotential(listing) {
  // AI/ML model would go here to analyze photos
  // For now, using heuristics
  
  const title = listing.title?.[0] || '';
  const description = listing.description?.[0] || '';
  const combined = (title + ' ' + description).toLowerCase();
  
  let score = 50; // Base score
  
  // Positive indicators
  if (combined.includes('mint') || combined.includes('nm/m')) score += 15;
  if (combined.includes('centered') || combined.includes('centering')) score += 10;
  if (combined.includes('sharp corners')) score += 10;
  if (combined.includes('no scratches') || combined.includes('clean')) score += 10;
  if (combined.includes('pack fresh')) score += 15;
  
  // Negative indicators
  if (combined.includes('damage') || combined.includes('worn')) score -= 30;
  if (combined.includes('played') || combined.includes('scratches')) score -= 20;
  if (combined.includes('off center') || combined.includes('oc')) score -= 25;
  
  return Math.min(Math.max(score, 0), 100);
}

function analyzeOpportunity(listing, marketData, type) {
  const currentPrice = parseFloat(listing.sellingStatus?.[0]?.currentPrice?.[0]?.__value__ || 0);
  
  if (type === 'raw_grading') {
    const gradingScore = calculateGradingPotential(listing);
    const gradingCost = 25; // PSA/TAG cost
    const ebayFees = 0.13; // 13% eBay + PayPal fees
    const shippingCost = 5;
    
    // Estimate graded value based on market data
    const projectedGradedValue = marketData?.avgPrice || currentPrice * 2.5;
    const projectedSalePrice = projectedGradedValue * 0.95; // Conservative estimate
    
    const totalCost = currentPrice + gradingCost + shippingCost;
    const netRevenue = projectedSalePrice * (1 - ebayFees);
    const netProfit = netRevenue - totalCost;
    const roi = (netProfit / totalCost) * 100;
    
    return {
      currentPrice,
      gradingCost,
      projectedSalePrice: Math.round(projectedSalePrice),
      netProfit: Math.round(netProfit),
      roi: Math.round(roi),
      confidence: gradingScore,
      riskLevel: gradingScore >= 80 ? 'low' : gradingScore >= 65 ? 'medium' : 'high'
    };
  } else {
    // Quick flip analysis
    const ebayFees = 0.13;
    const shippingCost = 5;
    
    const projectedSalePrice = marketData?.avgPrice || currentPrice * 1.3;
    const totalCost = currentPrice + shippingCost;
    const netRevenue = projectedSalePrice * (1 - ebayFees);
    const netProfit = netRevenue - totalCost;
    const roi = (netProfit / totalCost) * 100;
    
    const confidence = marketData?.salesVolume > 10 ? 85 : 70;
    
    return {
      currentPrice,
      projectedSalePrice: Math.round(projectedSalePrice),
      netProfit: Math.round(netProfit),
      roi: Math.round(roi),
      confidence,
      riskLevel: confidence >= 80 ? 'low' : 'medium'
    };
  }
}

// ========================================
// OPPORTUNITY SCANNING
// ========================================

async function scanForOpportunities() {
  console.log('🔍 Scanning for opportunities...');
  
  const searches = [
    // Raw grading opportunities - Football
    { keywords: 'CJ Stroud Prizm Silver RC raw', type: 'raw_grading', sport: 'Football', min: 50, max: 100 },
    { keywords: 'Brock Purdy Prizm Silver RC raw', type: 'raw_grading', sport: 'Football', min: 50, max: 100 },
    { keywords: 'Anthony Richardson Prizm RC raw', type: 'raw_grading', sport: 'Football', min: 50, max: 100 },
    
    // Raw grading - Baseball
    { keywords: 'Bobby Witt Jr Chrome RC raw', type: 'raw_grading', sport: 'Baseball', min: 50, max: 100 },
    { keywords: 'Julio Rodriguez Chrome RC raw', type: 'raw_grading', sport: 'Baseball', min: 50, max: 100 },
    { keywords: 'Corbin Carroll Chrome RC raw', type: 'raw_grading', sport: 'Baseball', min: 50, max: 100 },
    
    // Raw grading - Pokemon
    { keywords: 'Charizard ex Obsidian Flames raw', type: 'raw_grading', tcg: 'Pokemon', min: 50, max: 100 },
    { keywords: 'Umbreon VMAX alt art raw', type: 'raw_grading', tcg: 'Pokemon', min: 50, max: 100 },
    { keywords: 'Pikachu VMAX rainbow raw', type: 'raw_grading', tcg: 'Pokemon', min: 50, max: 100 },
    
    // Raw grading - One Piece
    { keywords: 'Luffy OP-05 alt art raw', type: 'raw_grading', tcg: 'One Piece', min: 50, max: 100 },
    { keywords: 'Zoro secret rare raw', type: 'raw_grading', tcg: 'One Piece', min: 50, max: 100 },
    
    // Quick flips - Graded cards
    { keywords: 'PSA 10 Football rookie 2023', type: 'quick_flip', sport: 'Football', min: 100, max: 300 },
    { keywords: 'PSA 9 Baseball Chrome rookie', type: 'quick_flip', sport: 'Baseball', min: 100, max: 300 },
    { keywords: 'PSA 10 Charizard', type: 'quick_flip', tcg: 'Pokemon', min: 100, max: 300 },
    { keywords: 'PSA 10 Luffy One Piece', type: 'quick_flip', tcg: 'One Piece', min: 100, max: 300 }
  ];
  
  let newOpportunities = [];
  
  for (const search of searches) {
    try {
      const listings = await searchEbayListings(
        search.keywords,
        search.min,
        search.max
      );
      
      for (const listing of listings) {
        const marketData = await getMarketData(
          search.keywords,
          listing.title?.[0],
          '',
          ''
        );
        
        const analysis = analyzeOpportunity(listing, marketData, search.type);
        
        // Only include if meets minimum thresholds
        if (analysis.netProfit >= CONFIG.scanning.minProfit && 
            analysis.confidence >= CONFIG.scanning.minConfidence) {
          
          const opportunity = {
            id: listing.itemId?.[0],
            type: search.type,
            sport: search.sport,
            tcg: search.tcg,
            title: listing.title?.[0],
            itemUrl: listing.viewItemURL?.[0],
            imageUrl: listing.galleryURL?.[0],
            ...analysis,
            discoveredAt: new Date().toISOString(),
            keywords: search.keywords
          };
          
          newOpportunities.push(opportunity);
        }
      }
      
      // Rate limiting - don't hammer eBay API
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`Error scanning ${search.keywords}:`, error.message);
    }
  }
  
  // Filter out duplicates
  const existingIds = opportunities.map(o => o.id);
  const uniqueNew = newOpportunities.filter(o => !existingIds.includes(o.id));
  
  if (uniqueNew.length > 0) {
    opportunities = [...opportunities, ...uniqueNew];
    console.log(`✅ Found ${uniqueNew.length} new opportunities`);
    
    // Send email alerts for high-value opportunities
    const alertWorthy = uniqueNew.filter(o => 
      o.netProfit >= 50 && o.confidence >= 80
    );
    
    if (alertWorthy.length > 0) {
      await sendOpportunityAlert(alertWorthy);
    }
  } else {
    console.log('ℹ️ No new opportunities found');
  }
  
  return uniqueNew;
}

// ========================================
// EMAIL ALERTS
// ========================================

async function sendOpportunityAlert(opportunities) {
  if (!CONFIG.email.alertTo) {
    console.log('⚠️ No alert email configured');
    return;
  }
  
  const opportunitiesHtml = opportunities.map(opp => `
    <div style="border: 2px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 16px; background: #f9fafb;">
      <h3 style="margin-top: 0; color: #1e40af;">
        ${opp.title}
      </h3>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 12px 0;">
        <div>
          <strong>Type:</strong> ${opp.type === 'raw_grading' ? 'Raw → Grade' : 'Quick Flip'}<br>
          <strong>Category:</strong> ${opp.sport || opp.tcg}<br>
          <strong>Current Price:</strong> $${opp.currentPrice}
        </div>
        <div>
          <strong>Projected Sale:</strong> $${opp.projectedSalePrice}<br>
          <strong>Net Profit:</strong> <span style="color: #16a34a; font-weight: bold;">$${opp.netProfit}</span><br>
          <strong>Confidence:</strong> ${opp.confidence}%
        </div>
      </div>
      <a href="${opp.itemUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 8px;">
        View on eBay →
      </a>
    </div>
  `).join('');
  
  const mailOptions = {
    from: CONFIG.email.user,
    to: CONFIG.email.alertTo,
    subject: `🚨 ${opportunities.length} New Card Flip Opportunit${opportunities.length > 1 ? 'ies' : 'y'} Found!`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 24px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0;">💎 New Flip Opportunities</h1>
          <p style="margin: 8px 0 0 0; opacity: 0.9;">Found ${opportunities.length} high-confidence opportunit${opportunities.length > 1 ? 'ies' : 'y'} matching your criteria</p>
        </div>
        <div style="padding: 24px; background: white;">
          ${opportunitiesHtml}
          <div style="margin-top: 24px; padding: 16px; background: #eff6ff; border-radius: 8px; border-left: 4px solid #2563eb;">
            <p style="margin: 0; color: #1e40af;"><strong>💡 Tip:</strong> Act fast on high-confidence opportunities. Check photos carefully before purchasing.</p>
          </div>
        </div>
        <div style="padding: 16px; background: #f3f4f6; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; color: #6b7280;">
          Powered by Card Flip Assistant | <a href="#" style="color: #2563eb;">Manage Alert Settings</a>
        </div>
      </div>
    `
  };
  
  try {
    await emailTransporter.sendMail(mailOptions);
    console.log(`📧 Alert sent to ${CONFIG.email.alertTo}`);
    
    alertHistory.push({
      sentAt: new Date().toISOString(),
      opportunityCount: opportunities.length,
      opportunities: opportunities.map(o => o.id)
    });
  } catch (error) {
    console.error('Email error:', error.message);
  }
}

// ========================================
// API ENDPOINTS
// ========================================

// Get all opportunities
app.get('/api/opportunities', (req, res) => {
  const { type, risk, minProfit } = req.query;
  
  let filtered = [...opportunities];
  
  if (type) filtered = filtered.filter(o => o.type === type);
  if (risk) filtered = filtered.filter(o => o.riskLevel === risk);
  if (minProfit) filtered = filtered.filter(o => o.netProfit >= parseInt(minProfit));
  
  // Sort by profit
  filtered.sort((a, b) => b.netProfit - a.netProfit);
  
  res.json({
    success: true,
    count: filtered.length,
    opportunities: filtered
  });
});

// Get single opportunity
app.get('/api/opportunities/:id', (req, res) => {
  const opportunity = opportunities.find(o => o.id === req.params.id);
  
  if (!opportunity) {
    return res.status(404).json({ success: false, error: 'Opportunity not found' });
  }
  
  res.json({ success: true, opportunity });
});

// Manually trigger scan
app.post('/api/scan', async (req, res) => {
  try {
    const newOpps = await scanForOpportunities();
    res.json({
      success: true,
      message: `Found ${newOpps.length} new opportunities`,
      opportunities: newOpps
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Generate listing content
app.post('/api/generate-listing', async (req, res) => {
  const { opportunityId } = req.body;
  const opportunity = opportunities.find(o => o.id === opportunityId);
  
  if (!opportunity) {
    return res.status(404).json({ success: false, error: 'Opportunity not found' });
  }
  
  // Use Claude API to generate optimized listing
  try {
    const response = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `Generate an optimized eBay listing for this card:
Title: ${opportunity.title}
Type: ${opportunity.type}
Category: ${opportunity.sport || opportunity.tcg}
Current Price: $${opportunity.currentPrice}
Projected Sale: $${opportunity.projectedSalePrice}

Create:
1. SEO-optimized title (80 chars max)
2. HTML description with compelling copy
3. Suggested starting bid and Buy It Now prices
4. Tags and keywords

Return as JSON with fields: title, description, startingBid, buyItNow, tags, keywords`
      }],
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    const generatedContent = JSON.parse(response.data.content[0].text);
    
    res.json({
      success: true,
      listing: generatedContent
    });
  } catch (error) {
    console.error('Listing generation error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to generate listing' });
  }
});

// Record a purchase
app.post('/api/purchases', (req, res) => {
  const { opportunityId, purchasePrice, notes } = req.body;
  
  const purchase = {
    id: Date.now().toString(),
    opportunityId,
    purchasePrice,
    purchaseDate: new Date().toISOString(),
    status: 'pending', // pending, grading, listed, sold
    notes
  };
  
  purchases.push(purchase);
  
  res.json({ success: true, purchase });
});

// Get all purchases
app.get('/api/purchases', (req, res) => {
  res.json({ success: true, purchases });
});

// Update purchase status
app.patch('/api/purchases/:id', (req, res) => {
  const purchase = purchases.find(p => p.id === req.params.id);
  
  if (!purchase) {
    return res.status(404).json({ success: false, error: 'Purchase not found' });
  }
  
  Object.assign(purchase, req.body);
  
  res.json({ success: true, purchase });
});

// Get statistics
app.get('/api/stats', (req, res) => {
  const totalOpportunities = opportunities.length;
  const avgProfit = opportunities.reduce((sum, o) => sum + o.netProfit, 0) / totalOpportunities || 0;
  const highConfidence = opportunities.filter(o => o.confidence >= 85).length;
  
  const totalPurchases = purchases.length;
  const soldPurchases = purchases.filter(p => p.status === 'sold');
  const totalProfit = soldPurchases.reduce((sum, p) => sum + (p.salePrice - p.purchasePrice || 0), 0);
  
  res.json({
    success: true,
    stats: {
      opportunities: {
        total: totalOpportunities,
        avgProfit: Math.round(avgProfit),
        highConfidence
      },
      purchases: {
        total: totalPurchases,
        sold: soldPurchases.length,
        totalProfit: Math.round(totalProfit)
      },
      alerts: {
        sent: alertHistory.length,
        lastSent: alertHistory[alertHistory.length - 1]?.sentAt
      }
    }
  });
});

// Test email
app.post('/api/test-email', async (req, res) => {
  try {
    await emailTransporter.sendMail({
      from: CONFIG.email.user,
      to: CONFIG.email.alertTo,
      subject: '✅ Card Flip Assistant - Email Test',
      html: '<h2>Your email alerts are working!</h2><p>You will receive real-time notifications when new opportunities are found.</p>'
    });
    
    res.json({ success: true, message: 'Test email sent' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Test eBay API
app.get('/api/test-ebay', async (req, res) => {
  try {
    const testUrl = `https://svcs.ebay.com/services/search/FindingService/v1?OPERATION-NAME=findItemsByKeywords&SERVICE-VERSION=1.0.0&SECURITY-APPNAME=${CONFIG.ebay.appId}&RESPONSE-DATA-FORMAT=JSON&REST-PAYLOAD&keywords=pokemon&paginationInput.entriesPerPage=1`;
    
    const response = await axios.get(testUrl);
    
    if (response.data.findItemsByKeywordsResponse?.[0]?.ack?.[0] === 'Success') {
      res.json({ 
        success: true, 
        message: 'eBay API is working!',
        itemCount: response.data.findItemsByKeywordsResponse[0].searchResult[0]['@count']
      });
    } else {
      res.json({ 
        success: false, 
        message: 'eBay returned an error',
        response: response.data 
      });
    }
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      details: error.response?.data || 'No additional details'
    });
  }
});

// ========================================
// SCHEDULED SCANNING
// ========================================

function startScheduledScanning() {
  console.log(`🚀 Starting scheduled scanning every ${CONFIG.scanning.intervalMinutes} minutes`);
  
  // Initial scan
  scanForOpportunities();
  
  // Schedule recurring scans
  setInterval(async () => {
    await scanForOpportunities();
  }, CONFIG.scanning.intervalMinutes * 60 * 1000);
}

// ========================================
// SERVER STARTUP
// ========================================

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║   Card Flip Assistant API Server          ║
║   Running on port ${PORT}                     ║
╚════════════════════════════════════════════╝
  `);
  
  // Start scanning if eBay credentials are configured AND auto-scan is not disabled
  if (process.env.DISABLE_AUTO_SCAN === 'true') {
    console.log('⚠️  Auto-scanning is DISABLED. Set DISABLE_AUTO_SCAN=false to enable.');
  } else if (CONFIG.ebay.appId) {
    startScheduledScanning();
  } else {
    console.log('⚠️  eBay API credentials not configured. Add to .env file to enable scanning.');
  }
});

module.exports = app;
