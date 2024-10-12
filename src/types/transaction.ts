export enum ChainEnum {
  ETHEREUM = 'ETHEREUM',
  BINANCE = 'BINANCE',
  POLYGON = 'POLYGON',
}

export enum TransactionStatusEnum {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  FAILED = 'FAILED',
}

export enum DistributionStatusEnum {
  PENDING = 'PENDING',
  DISTRIBUTED = 'DISTRIBUTED',
  FAILED = 'FAILED',
  PROCESSING = 'PROCESSING',
}

export enum StakingStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  STAKED = 'STAKED',
  FAILED = 'FAILED',
}

export enum MigrationStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  MIGRATED = 'MIGRATED',
  FAILED = 'FAILED',
}
