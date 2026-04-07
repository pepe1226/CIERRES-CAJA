export interface ShiftClosure {
  id?: string;
  date: string;
  responsible: string;
  systemAmount: number;
  systemBalance: number;
  physicalAmount: number;
  difference: number;
  notes?: string;
  createdBy: string;
  status?: 'safe' | 'transit' | 'bank';
}

export interface Movement {
  id: string;
  date: string;
  type: 'outflow' | 'transfer' | 'internal_transfer';
  category?: string;
  amount: number;
  description: string;
  createdBy: string;
  from?: string;
  to?: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  role: 'admin' | 'user';
}
