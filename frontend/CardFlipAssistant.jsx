import React, { useState, useEffect, useCallback } from 'react';
import { Search, TrendingUp, AlertCircle, RefreshCw, Bell, Package, Mail } from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const CardFlipAssistant = () => {
  const [opportunities, setOpportunities] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [filterRisk, setFilterRisk] = useState('all');
  const [selectedCard, setSelectedCard] = useState(null);
  const [generatedListing, setGeneratedListing] = useState(null);
  const [activeTab, setActiveTab] = useState('opportunities');
  const [emailConfigured, setEmailConfigured] = useState(false);

  // Fetch opportunities from backend
  const fetchOpportunities = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterType !== 'all') params.append('type', filterType);
      if (filterRisk !== 'all') params.append('risk', filterRisk);
      
      const response = await fetch(`${API_URL}/opportunities?${params}`);
      const data = await response.json();
      
      if (data.success) {
        setOpportunities(data.opportunities);
      }
    } catch (error) {
      console.error('Error fetching opportunities:', error);
    }
    setLoading(false);
  }, [filterType, filterRisk]);

  // Fetch purchases
  const fetchPurchases = async () => {
    try {
      const response = await fetch(`${API_URL}/purchases`);
      const data = await response.json();
      
      if (data.success) {
        setPurchases(data.purchases);
      }
    } catch (error) {
      console.error('Error fetching purchases:', error);
    }
  };

  // Fetch stats
  const fetchStats = async () => {
    try {
      const response = await fetch(`${API_URL}/stats`);
      const data = await response.json();
      
      if (data.success) {
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  // Trigger manual scan
  const triggerScan = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/scan`, {
        method: 'POST'
      });
      const data = await response.json();
      
      if (data.success) {
        alert(`Found ${data.opportunities.length} new opportunities!`);
        await fetchOpportunities();
      }
    } catch (error) {
      console.error('Error triggering scan:', error);
      alert('Error scanning for opportunities. Check console.');
    }
    setLoading(false);
  };

  // Generate listing
  const generateListingContent = async (opportunity) => {
    setLoading(true);
    setSelectedCard(opportunity);
    
    try {
      const response = await fetch(`${API_URL}/generate-listing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunityId: opportunity.id })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setGeneratedListing(data.listing);
      }
    } catch (error) {
      console.error('Error generating listing:', error);
      alert('Error generating listing. Check console.');
    }
    setLoading(false);
  };

  // Record purchase
  const recordPurchase = async (opportunity) => {
    const notes = prompt('Add notes about this purchase (optional):');
    
    try {
      const response = await fetch(`${API_URL}/purchases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opportunityId: opportunity.id,
          purchasePrice: opportunity.currentPrice,
          notes: notes || ''
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        alert('Purchase recorded! Track it in the Purchases tab.');
        await fetchPurchases();
      }
    } catch (error) {
      console.error('Error recording purchase:', error);
    }
  };

  // Update purchase status
  const updatePurchaseStatus = async (purchaseId, status, salePrice = null) => {
    try {
      const body = { status };
      if (salePrice) body.salePrice = parseFloat(salePrice);
      
      const response = await fetch(`${API_URL}/purchases/${purchaseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      const data = await response.json();
      
      if (data.success) {
        await fetchPurchases();
        await fetchStats();
      }
    } catch (error) {
      console.error('Error updating purchase:', error);
    }
  };

  // Test email
  const testEmail = async () => {
    try {
      const response = await fetch(`${API_URL}/test-email`, {
        method: 'POST'
      });
      
      const data = await response.json();
      
      if (data.success) {
        alert('✅ Test email sent! Check your inbox.');
        setEmailConfigured(true);
      }
    } catch (error) {
      alert('❌ Email not configured. Check backend .env file.');
    }
  };

  useEffect(() => {
    fetchOpportunities();
    fetchPurchases();
    fetchStats();
    
    // Auto-refresh every 5 minutes
    const interval = setInterval(() => {
      fetchOpportunities();
      fetchStats();
    }, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [fetchOpportunities]);

  const getRiskColor = (risk) => {
    switch(risk) {
      case 'low': return 'text-green-600 bg-green-50';
      case 'medium': return 'text-yellow-600 bg-yellow-50';
      case 'high': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getConfidenceColor = (confidence) => {
    if (confidence >= 85) return 'text-green-600';
    if (confidence >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'sold': return 'bg-green-100 text-green-800';
      case 'listed': return 'bg-blue-100 text-blue-800';
      case 'grading': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  };

  // Render Opportunities Tab
  const renderOpportunities = () => (
    <>
      {/* Filters */}
      <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div className="flex gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Type</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
              >
                <option value="all">All Types</option>
                <option value="raw_grading">Raw → Grade</option>
                <option value="quick_flip">Quick Flip</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Risk</label>
              <select
                value={filterRisk}
                onChange={(e) => setFilterRisk(e.target.value)}
                className="px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
              >
                <option value="all">All Risk</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={testEmail}
              className="px-4 py-2 border-2 border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
            >
              <Mail size={18} />
              Test Email
            </button>
            <button
              onClick={triggerScan}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-semibold flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
              Scan Now
            </button>
          </div>
        </div>
      </div>

      {/* Opportunities Grid */}
      {loading && opportunities.length === 0 ? (
        <div className="bg-white rounded-xl shadow-lg p-12 text-center">
          <RefreshCw className="animate-spin mx-auto mb-4 text-blue-600" size={48} />
          <p className="text-gray-600 text-lg">Loading opportunities...</p>
        </div>
      ) : opportunities.length === 0 ? (
        <div className="bg-white rounded-xl shadow-lg p-12 text-center">
          <AlertCircle className="mx-auto mb-4 text-gray-400" size={48} />
          <p className="text-gray-600 text-lg mb-4">No opportunities found yet</p>
          <button
            onClick={triggerScan}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold"
          >
            Run First Scan
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {opportunities.map(opp => (
            <div key={opp.id} className="bg-white rounded-xl shadow-lg hover:shadow-2xl transition-shadow border-2 border-gray-100 overflow-hidden">
              <div className="p-6">
                {/* Header */}
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${getRiskColor(opp.riskLevel)}`}>
                        {opp.riskLevel.toUpperCase()}
                      </span>
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700">
                        {opp.type === 'raw_grading' ? 'RAW → GRADE' : 'QUICK FLIP'}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 line-clamp-2">
                      {opp.title}
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">{opp.sport || opp.tcg}</p>
                  </div>
                  <div className={`text-right ${getConfidenceColor(opp.confidence)}`}>
                    <div className="text-2xl font-bold">{opp.confidence}%</div>
                    <div className="text-xs">Confidence</div>
                  </div>
                </div>

                {/* Profit Breakdown */}
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-4 rounded-lg mb-4 border-2 border-green-200">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-xs text-gray-600 mb-1">Buy Price</div>
                      <div className="text-lg font-bold text-gray-900">${opp.currentPrice}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-600 mb-1">Projected Sale</div>
                      <div className="text-lg font-bold text-gray-900">${opp.projectedSalePrice}</div>
                    </div>
                  </div>
                  <div className="border-t-2 border-green-300 mt-3 pt-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-semibold text-gray-700">Net Profit:</span>
                      <span className="text-2xl font-bold text-green-600">${opp.netProfit}</span>
                    </div>
                    <div className="text-xs text-gray-600 text-right mt-1">
                      ({opp.roi}% ROI)
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <a
                    href={opp.itemUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-3 rounded-lg font-semibold text-center text-sm"
                  >
                    View on eBay
                  </a>
                  <button
                    onClick={() => generateListingContent(opp)}
                    className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 px-3 rounded-lg font-semibold text-sm"
                  >
                    Generate Listing
                  </button>
                  <button
                    onClick={() => recordPurchase(opp)}
                    className="bg-green-600 hover:bg-green-700 text-white py-2 px-3 rounded-lg font-semibold"
                  >
                    <Package size={18} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );

  // Render Purchases Tab
  const renderPurchases = () => (
    <div className="space-y-6">
      {purchases.length === 0 ? (
        <div className="bg-white rounded-xl shadow-lg p-12 text-center">
          <Package className="mx-auto mb-4 text-gray-400" size={48} />
          <p className="text-gray-600 text-lg">No purchases recorded yet</p>
          <p className="text-gray-500 text-sm mt-2">Click the package icon on opportunities to track purchases</p>
        </div>
      ) : (
        purchases.map(purchase => {
          const opp = opportunities.find(o => o.id === purchase.opportunityId);
          const profit = purchase.salePrice ? purchase.salePrice - purchase.purchasePrice : null;
          
          return (
            <div key={purchase.id} className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">{opp?.title || 'Unknown Card'}</h3>
                  <p className="text-sm text-gray-600">Purchased: {new Date(purchase.purchaseDate).toLocaleDateString()}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusColor(purchase.status)}`}>
                  {purchase.status.toUpperCase()}
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <div className="text-xs text-gray-600">Purchase Price</div>
                  <div className="text-lg font-bold">${purchase.purchasePrice}</div>
                </div>
                {purchase.salePrice && (
                  <>
                    <div>
                      <div className="text-xs text-gray-600">Sale Price</div>
                      <div className="text-lg font-bold text-green-600">${purchase.salePrice}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-600">Profit</div>
                      <div className={`text-lg font-bold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ${profit}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {purchase.notes && (
                <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg mb-4">{purchase.notes}</p>
              )}

              <div className="flex gap-2">
                {purchase.status === 'pending' && (
                  <button
                    onClick={() => updatePurchaseStatus(purchase.id, 'grading')}
                    className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm font-semibold"
                  >
                    Mark as Grading
                  </button>
                )}
                {purchase.status === 'grading' && (
                  <button
                    onClick={() => updatePurchaseStatus(purchase.id, 'listed')}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold"
                  >
                    Mark as Listed
                  </button>
                )}
                {purchase.status === 'listed' && (
                  <button
                    onClick={() => {
                      const salePrice = prompt('Enter sale price:');
                      if (salePrice) updatePurchaseStatus(purchase.id, 'sold', salePrice);
                    }}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold"
                  >
                    Mark as Sold
                  </button>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8 mb-6 md:mb-8 border-t-4 border-blue-600">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2 flex items-center gap-3">
                <TrendingUp className="text-blue-600" size={40} />
                Card Flip Assistant Pro
              </h1>
              <p className="text-gray-600">Real-time opportunity scanner with email alerts</p>
            </div>
            <div className="flex items-center gap-2">
              {emailConfigured && (
                <div className="flex items-center gap-2 bg-green-50 px-4 py-2 rounded-lg">
                  <Bell className="text-green-600" size={18} />
                  <span className="text-sm font-semibold text-green-700">Alerts Active</span>
                </div>
              )}
            </div>
          </div>
          
          {/* Stats Dashboard */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-lg border border-green-200">
                <div className="text-green-700 text-xs md:text-sm font-semibold mb-1">Opportunities</div>
                <div className="text-2xl md:text-3xl font-bold text-green-900">{stats.opportunities.total}</div>
              </div>
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg border border-blue-200">
                <div className="text-blue-700 text-xs md:text-sm font-semibold mb-1">Avg. Profit</div>
                <div className="text-2xl md:text-3xl font-bold text-blue-900">${stats.opportunities.avgProfit}</div>
              </div>
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-lg border border-purple-200">
                <div className="text-purple-700 text-xs md:text-sm font-semibold mb-1">Purchases</div>
                <div className="text-2xl md:text-3xl font-bold text-purple-900">{stats.purchases.total}</div>
              </div>
              <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 p-4 rounded-lg border border-yellow-200">
                <div className="text-yellow-700 text-xs md:text-sm font-semibold mb-1">Total Profit</div>
                <div className="text-2xl md:text-3xl font-bold text-yellow-900">${stats.purchases.totalProfit}</div>
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-lg mb-6 overflow-hidden">
          <div className="flex border-b">
            <button
              onClick={() => setActiveTab('opportunities')}
              className={`flex-1 px-6 py-4 font-semibold flex items-center justify-center gap-2 ${
                activeTab === 'opportunities'
                  ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Search size={20} />
              <span className="hidden md:inline">Opportunities</span>
            </button>
            <button
              onClick={() => setActiveTab('purchases')}
              className={`flex-1 px-6 py-4 font-semibold flex items-center justify-center gap-2 ${
                activeTab === 'purchases'
                  ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Package size={20} />
              <span className="hidden md:inline">Purchases</span>
            </button>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'opportunities' && renderOpportunities()}
        {activeTab === 'purchases' && renderPurchases()}

        {/* Listing Generator Modal */}
        {generatedListing && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto" onClick={() => setGeneratedListing(null)}>
            <div className="bg-white rounded-2xl max-w-4xl w-full my-8" onClick={(e) => e.stopPropagation()}>
              <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-blue-600 text-white p-6 rounded-t-2xl">
                <h2 className="text-2xl font-bold mb-2">Optimized eBay Listing</h2>
                <p className="text-purple-100">{selectedCard?.title}</p>
              </div>
              
              <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                {/* Title */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Title</label>
                  <div className="bg-gray-50 p-4 rounded-lg border-2 border-gray-200">
                    <p className="font-mono text-sm break-words">{generatedListing.title}</p>
                    <button
                      onClick={() => copyToClipboard(generatedListing.title)}
                      className="mt-2 text-blue-600 hover:text-blue-700 text-sm font-semibold"
                    >
                      📋 Copy
                    </button>
                  </div>
                </div>

                {/* Pricing */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Starting Bid</label>
                    <div className="bg-green-50 p-4 rounded-lg border-2 border-green-200">
                      <p className="text-2xl font-bold text-green-600">${generatedListing.startingBid}</p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Buy It Now</label>
                    <div className="bg-blue-50 p-4 rounded-lg border-2 border-blue-200">
                      <p className="text-2xl font-bold text-blue-600">${generatedListing.buyItNow}</p>
                    </div>
                  </div>
                </div>

                {/* Description Preview */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Description</label>
                  <div className="bg-gray-50 p-4 rounded-lg border-2 border-gray-200 max-h-96 overflow-y-auto">
                    <div dangerouslySetInnerHTML={{ __html: generatedListing.description }} />
                  </div>
                  <button
                    onClick={() => copyToClipboard(generatedListing.description)}
                    className="mt-2 text-blue-600 hover:text-blue-700 text-sm font-semibold"
                  >
                    📋 Copy HTML
                  </button>
                </div>

                <button
                  onClick={() => setGeneratedListing(null)}
                  className="w-full bg-gray-600 hover:bg-gray-700 text-white py-3 rounded-lg font-semibold"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CardFlipAssistant;
