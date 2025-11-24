import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type MarketType = 'crypto' | 'stocks' | 'both';
export type SortField = 'name' | 'price' | 'change' | 'marketCap' | 'volume';
export type SortOrder = 'asc' | 'desc';

interface MarketState {
  activeMarket: MarketType;
  sortField: SortField;
  sortOrder: SortOrder;
  searchQuery: string;
  cryptoPrices: Record<string, any>;
  stockPrices: Record<string, any>;
}

const initialState: MarketState = {
  activeMarket: 'both',
  sortField: 'marketCap',
  sortOrder: 'desc',
  searchQuery: '',
  cryptoPrices: {},
  stockPrices: {},
};

export const marketSlice = createSlice({
  name: 'market',
  initialState,
  reducers: {
    setActiveMarket: (state, action: PayloadAction<MarketType>) => {
      state.activeMarket = action.payload;
    },
    setSortField: (state, action: PayloadAction<SortField>) => {
      if (state.sortField === action.payload) {
        state.sortOrder = state.sortOrder === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortField = action.payload;
        state.sortOrder = 'desc';
      }
    },
    setSearchQuery: (state, action: PayloadAction<string>) => {
      state.searchQuery = action.payload;
    },
    updateCryptoPrices: (state, action: PayloadAction<Record<string, any>>) => {
      state.cryptoPrices = { ...state.cryptoPrices, ...action.payload };
    },
    updateStockPrices: (state, action: PayloadAction<Record<string, any>>) => {
      state.stockPrices = { ...state.stockPrices, ...action.payload };
    },
  },
});

export const {
  setActiveMarket,
  setSortField,
  setSearchQuery,
  updateCryptoPrices,
  updateStockPrices,
} = marketSlice.actions;

export default marketSlice.reducer;
