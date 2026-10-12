import { sqliteTable, integer, real, text, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
export const measurements = sqliteTable('measurements', {
  id: integer('id').primaryKey(), monitorId: text('monitor_id').notNull(), monitor: text('monitor').notNull(),
  metric: text('metric').notNull(), value: real('value').notNull(), unit: text('unit').notNull(),
  observedAt: text('observed_at'), fetchedAt: text('fetched_at').notNull(), quality: text('quality').notNull(),
}, t => [uniqueIndex('measurement_sample').on(t.monitorId,t.metric,t.observedAt), index('metric_time').on(t.metric,t.observedAt)]);
export const attempts = sqliteTable('attempts', {
  id: integer('id').primaryKey(), fetchedAt: text('fetched_at').notNull(), status: text('status').notNull(),
  measurementsAdded: integer('measurements_added').notNull(),
}, t => [uniqueIndex('collection_time').on(t.fetchedAt)]);
export const capabilitySamples = sqliteTable('capability_samples', {
  id: integer('id').primaryKey(), monitorId: text('monitor_id').notNull(), monitor: text('monitor').notNull(),
  namespace: text('namespace').notNull(), property: text('property').notNull(), instance: text('instance').notNull(),
  valueJson: text('value_json').notNull(), observedAt: text('observed_at'), fetchedAt: text('fetched_at').notNull(), uncertaintyMs: real('uncertainty_ms'),
}, t => [uniqueIndex('capability_sample').on(t.monitorId,t.namespace,t.property,t.instance,t.observedAt)]);
export const state = sqliteTable('state', { key: text('key').primaryKey(), value: text('value').notNull() });
