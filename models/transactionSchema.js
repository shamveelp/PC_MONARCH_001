const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Transaction Schema
const transactionSchema = new Schema({
  transactionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    required: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  
  // User Information
  user: {
    userId: {
      type: String,
      required: true,
      index: true
    },
    fullName: {
      type: String,
      required: true
    },
    email: {
      type: String,
      required: true
    },
    phone: {
      type: String
    }
  },
  
  // Transaction Details
  transactionType: {
    type: String,
    required: true,
    enum: ['ONLINE_PAYMENT', 'WALLET_DEPOSIT', 'WALLET_WITHDRAWAL', 'REFUND', 'ADJUSTMENT'],
    index: true
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'USD',
    required: true
  },
  status: {
    type: String,
    required: true,
    enum: ['PENDING', 'COMPLETED', 'FAILED', 'CANCELLED'],
    default: 'PENDING',
    index: true
  },
  
  // Source Information
  source: {
    sourceType: {
      type: String,
      required: true,
      enum: ['CREDIT_CARD', 'BANK_TRANSFER', 'PAYPAL', 'WALLET', 'ORDER_REFUND', 'OTHER']
    },
    sourceDetails: {
      type: String
    },
    referenceNumber: {
      type: String
    }
  },
  
  // For Refund Transactions
  refundInfo: {
    originalOrderId: {
      type: String,
      index: true
    },
    reason: {
      type: String
    },
    returnedItems: [{
      productId: String,
      quantity: Number,
      amount: Number
    }]
  },
  
  // For Online Payments
  paymentInfo: {
    paymentMethod: {
      type: String
    },
    cardLast4: {
      type: String
    },
    paymentGateway: {
      type: String
    },
    gatewayTransactionId: {
      type: String
    }
  },
  
  // For Wallet Transactions
  walletInfo: {
    walletId: {
      type: String
    },
    balanceBefore: {
      type: Number
    },
    balanceAfter: {
      type: Number
    }
  },
  
  // Additional Metadata
  metadata: {
    ipAddress: String,
    userAgent: String,
    deviceInfo: String,
    location: {
      country: String,
      city: String
    }
  },
  
  // Notes and Admin Information
  adminNotes: {
    type: String
  },
  lastModifiedBy: {
    type: String
  }
}, {
  timestamps: true // This automatically adds createdAt and updatedAt fields
});

// Indexes for common queries
transactionSchema.index({ 'user.userId': 1, createdAt: -1 });
transactionSchema.index({ transactionType: 1, createdAt: -1 });
transactionSchema.index({ status: 1, createdAt: -1 });
transactionSchema.index({ createdAt: -1 });

// Virtual for formatted amount with currency symbol
transactionSchema.virtual('formattedAmount').get(function() {
  const symbol = this.currency === 'USD' ? '$' : 
                 this.currency === 'EUR' ? '€' : 
                 this.currency === 'GBP' ? '£' : '';
  
  const prefix = this.amount >= 0 ? '+' : '';
  return `${prefix}${symbol}${Math.abs(this.amount).toFixed(2)}`;
});

// Method to check if transaction is a refund
transactionSchema.methods.isRefund = function() {
  return this.transactionType === 'REFUND';
};

// Static method to find user's transactions
transactionSchema.statics.findByUserId = function(userId) {
  return this.find({ 'user.userId': userId }).sort({ createdAt: -1 });
};

// Static method to find transactions by type
transactionSchema.statics.findByType = function(type) {
  return this.find({ transactionType: type }).sort({ createdAt: -1 });
};

// Create model from schema
const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction;