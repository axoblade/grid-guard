export enum TransformerStatus {
  GREEN = 'GREEN',
  ORANGE = 'ORANGE',
  RED = 'RED',
  UNKNOWN = 'UNKNOWN',
  DRAFT = 'DRAFT',
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface Location {
  latitude: number;
  longitude: number;
}

export interface Transformer {
  id: string;
  name: string;
  serialNumber: string;
  phoneNumber: string;
  ownerId: string;
  registrationLocation: Location;
  currentLocation: {
    latitude: number;
    longitude: number;
    lastUpdated: string;
  };
  safeRadius: number; // In meters
  status: TransformerStatus;
  riskRating?: number; // 0-100
  riskAnalysis?: string;
  realTimeHint?: string;
  alertPhoneNumbers: string[];
  maintenanceSchedule?: {
    lastMaintenance: string;
    nextMaintenance: string;
    notes: string;
  };
  simSwapHistory: {
    lastSwapped: string;
    isFraudPotential: boolean;
  };
}

export interface Alert {
  id: string;
  transformerId: string;
  transformerName: string;
  type: 'LOCATION_BREACH' | 'SIM_SWAP' | 'RISK_HIGH' | 'SYSTEM_ERROR';
  message: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  createdAt: string;
  isRead: boolean;
}

export interface MaintenanceLog {
  id: string;
  transformerId: string;
  date: string;
  performedBy: string;
  action: string;
  notes: string;
}

export enum SubscriptionPlan {
  PAY_AS_YOU_GO = 'PAY_AS_YOU_GO',
  ANNUAL_UNLIMITED = 'ANNUAL_UNLIMITED'
}

export interface BillingInfo {
  currentPlan: SubscriptionPlan;
  status: 'active' | 'canceled' | 'past_due';
  periodStart: string;
  periodEnd: string;
  cancelAtPeriodEnd: boolean;
  upcomingPlan?: SubscriptionPlan;
}

export interface PaymentRecord {
  id: string;
  amount: number;
  date: string;
  status: 'succeeded' | 'pending' | 'failed';
  plan: SubscriptionPlan;
  description: string;
}
