import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { RootState } from '../store';

interface PortfolioHolding {
  id: string;
  userId: string;
  symbol: string;
  type: string;
  quantity: number;
  averageBuyPrice: number;
  createdAt: string;
  updatedAt: string;
}

interface Transaction {
  id: string;
  userId: string;
  symbol: string;
  type: string;
  action: string;
  quantity: number;
  price: number;
  total: number;
  createdAt: string;
}

interface PortfolioState {
  balance: number;
  holdings: PortfolioHolding[];
  transactions: Transaction[];
  loading: boolean;
  error: string | null;
  totalValue: number;
  totalPL: number;
}

const initialState: PortfolioState = {
  balance: 0,
  holdings: [],
  transactions: [],
  loading: false,
  error: null,
  totalValue: 0,
  totalPL: 0,
};

// Async thunks
export const fetchPortfolio = createAsyncThunk(
  'portfolio/fetchPortfolio',
  async (_, { rejectWithValue }) => {
    try {
      const response = await fetch('/api/portfolio');
      if (!response.ok) {
        const error = await response.json();
        return rejectWithValue(error.error || 'Failed to fetch portfolio');
      }
      const data = await response.json();
      return data;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Network error');
    }
  }
);

export const executeBuy = createAsyncThunk(
  'portfolio/executeBuy',
  async (
    { symbol, type, quantity, price }: { symbol: string; type: string; quantity: number; price: number },
    { rejectWithValue }
  ) => {
    try {
      const response = await fetch('/api/trade/buy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ symbol, type, quantity, price }),
      });

      if (!response.ok) {
        const error = await response.json();
        return rejectWithValue(error.error || 'Failed to execute buy order');
      }

      const data = await response.json();
      return data;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Network error');
    }
  }
);

export const executeSell = createAsyncThunk(
  'portfolio/executeSell',
  async (
    { symbol, type, quantity, price }: { symbol: string; type: string; quantity: number; price: number },
    { rejectWithValue }
  ) => {
    try {
      const response = await fetch('/api/trade/sell', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ symbol, type, quantity, price }),
      });

      if (!response.ok) {
        const error = await response.json();
        return rejectWithValue(error.error || 'Failed to execute sell order');
      }

      const data = await response.json();
      return data;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Network error');
    }
  }
);

export const fetchTransactionHistory = createAsyncThunk(
  'portfolio/fetchTransactionHistory',
  async ({ page = 1, limit = 20, type }: { page?: number; limit?: number; type?: string }, { rejectWithValue }) => {
    try {
      const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() });
      if (type) params.append('type', type);

      const response = await fetch(`/api/trade/history?${params}`);
      if (!response.ok) {
        const error = await response.json();
        return rejectWithValue(error.error || 'Failed to fetch transaction history');
      }
      const data = await response.json();
      return data;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Network error');
    }
  }
);

export const portfolioSlice = createSlice({
  name: 'portfolio',
  initialState,
  reducers: {
    setBalance: (state, action: PayloadAction<number>) => {
      state.balance = action.payload;
    },
    setHoldings: (state, action: PayloadAction<PortfolioHolding[]>) => {
      state.holdings = action.payload;
    },
    addTransaction: (state, action: PayloadAction<Transaction>) => {
      state.transactions.unshift(action.payload);
    },
    updatePortfolioValue: (state, action: PayloadAction<{ cryptoPrices: Record<string, any>; stockPrices: Record<string, any> }>) => {
      const { cryptoPrices, stockPrices } = action.payload;

      let holdingsValue = 0;
      let totalCost = 0;

      state.holdings.forEach((holding) => {
        const currentPrice = holding.type === 'CRYPTO'
          ? cryptoPrices[holding.symbol]?.price
          : stockPrices[holding.symbol]?.price;

        if (currentPrice) {
          holdingsValue += holding.quantity * currentPrice;
          totalCost += holding.quantity * holding.averageBuyPrice;
        }
      });

      state.totalValue = state.balance + holdingsValue;
      state.totalPL = holdingsValue - totalCost;
    },
    clearPortfolio: (state) => {
      state.balance = 0;
      state.holdings = [];
      state.transactions = [];
      state.totalValue = 0;
      state.totalPL = 0;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    // Fetch Portfolio
    builder.addCase(fetchPortfolio.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(fetchPortfolio.fulfilled, (state, action) => {
      state.loading = false;
      state.balance = action.payload.balance;
      state.holdings = action.payload.holdings;
    });
    builder.addCase(fetchPortfolio.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload as string;
    });

    // Execute Buy
    builder.addCase(executeBuy.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(executeBuy.fulfilled, (state, action) => {
      state.loading = false;
      state.balance = action.payload.balance;
      if (action.payload.transaction) {
        state.transactions.unshift(action.payload.transaction);
      }
      // Refresh portfolio
    });
    builder.addCase(executeBuy.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload as string;
    });

    // Execute Sell
    builder.addCase(executeSell.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(executeSell.fulfilled, (state, action) => {
      state.loading = false;
      state.balance = action.payload.balance;
      if (action.payload.transaction) {
        state.transactions.unshift(action.payload.transaction);
      }
      // Refresh portfolio
    });
    builder.addCase(executeSell.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload as string;
    });

    // Fetch Transaction History
    builder.addCase(fetchTransactionHistory.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(fetchTransactionHistory.fulfilled, (state, action) => {
      state.loading = false;
      state.transactions = action.payload.transactions;
    });
    builder.addCase(fetchTransactionHistory.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload as string;
    });
  },
});

export const {
  setBalance,
  setHoldings,
  addTransaction,
  updatePortfolioValue,
  clearPortfolio,
} = portfolioSlice.actions;

// Selectors
export const selectPortfolioBalance = (state: RootState) => state.portfolio.balance;
export const selectPortfolioHoldings = (state: RootState) => state.portfolio.holdings;
export const selectPortfolioTotalValue = (state: RootState) => state.portfolio.totalValue;
export const selectPortfolioTotalPL = (state: RootState) => state.portfolio.totalPL;
export const selectPortfolioLoading = (state: RootState) => state.portfolio.loading;
export const selectPortfolioError = (state: RootState) => state.portfolio.error;
export const selectTransactions = (state: RootState) => state.portfolio.transactions;

export default portfolioSlice.reducer;
