import { Injectable } from '@nestjs/common';
import { type HealthIndicatorResult } from './health-indicator-result.interface';

/**
 * ONLY USED INTERNALLY
 * The goal is to make this service public in the future
 * This is a helper service which can be used to create health indicator results
 * @internal
 */
@Injectable()
export class HealthIndicatorService {
  check<Key extends string>(key: Key) {
    return new HealthIndicatorSession(key);
  }
}

type AdditionalData = Record<string, any>;

class HealthIndicatorSession<Key extends Readonly<string>> {
  constructor(private readonly key: Key) {}

  /**
   * Mark the health indicator as down
   * @param data additional data which will get appended to the result object
   */
  down<T extends AdditionalData>(
    data?: T,
  ): HealthIndicatorResult<typeof this.key, 'down', T>;
  down<T extends string>(
    data?: T,
  ): HealthIndicatorResult<typeof this.key, 'down', { message: T }>;
  down<T extends AdditionalData | string>(
    data?: T,
  ): HealthIndicatorResult<typeof this.key, 'down'> {
    let additionalData: AdditionalData = {};

    if (typeof data === 'string') {
      additionalData = { message: data };
    } else if (typeof data === 'object') {
      additionalData = data;
    }

    const detail = {
      status: 'down' as const,
      ...additionalData,
    };

    return {
      [this.key]: detail,
      // TypeScript does not infer this.key as Key correctly.
    } as Record<Key, typeof detail>;
  }

  up<T extends AdditionalData>(data?: T): HealthIndicatorResult<Key, 'up', T>;
  up<T extends string>(
    data?: T,
  ): HealthIndicatorResult<Key, 'up', { message: T }>;
  up<T extends AdditionalData | string>(
    data?: T,
  ): HealthIndicatorResult<Key, 'up'> {
    let additionalData: AdditionalData = {};

    if (typeof data === 'string') {
      additionalData = { message: data };
    } else if (typeof data === 'object') {
      additionalData = data;
    }

    const detail = {
      status: 'up' as const,
      ...additionalData,
    };

    return {
      [this.key]: detail,
      // TypeScript does not infer this.key as Key correctly.
    } as Record<Key, typeof detail>;
  }
}
