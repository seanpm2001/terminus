import { Injectable, Scope } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type * as NestJSTypeOrm from '@nestjs/typeorm';
import type * as TypeOrm from 'typeorm';
import { HealthIndicator } from '../';
import { MongoConnectionError } from '../../errors';
import {
  TimeoutError as PromiseTimeoutError,
  promiseTimeout,
  checkPackages,
} from '../../utils';
import { HealthIndicatorService } from '../health-indicator.service';

export interface TypeOrmPingCheckSettings {
  /**
   * The connection which the ping check should get executed
   */
  // `any` type in case of typeorm version mismatch
  connection?: any;
  /**
   * The amount of time the check should require in ms
   */
  timeout?: number;
}

/**
 * The TypeOrmHealthIndicator contains health indicators
 * which are used for health checks related to TypeOrm
 *
 * @publicApi
 * @module TerminusModule
 */
@Injectable({ scope: Scope.TRANSIENT })
export class TypeOrmHealthIndicator extends HealthIndicator {
  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {
    super();
    this.checkDependantPackages();
  }

  /**
   * Checks if the dependant packages are present
   */
  private checkDependantPackages() {
    checkPackages(['@nestjs/typeorm', 'typeorm'], this.constructor.name);
  }

  /**
   * Returns the connection of the current DI context
   */
  private getContextConnection(): TypeOrm.DataSource | null {
    const { getDataSourceToken } =
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@nestjs/typeorm/dist/common/typeorm.utils') as typeof NestJSTypeOrm;

    try {
      return this.moduleRef.get(getDataSourceToken() as string, {
        strict: false,
      });
    } catch (err) {
      return null;
    }
  }

  private async checkMongoDBConnection(connection: any) {
    return new Promise<void>((resolve, reject) => {
      const driver = connection.driver;
      const url = connection.options.url
        ? connection.options.url
        : driver.buildConnectionUrl(connection.options);

      // FIXME: Hacky workaround which uses the native MongoClient
      driver.mongodb.MongoClient.connect(
        url,
        driver.buildConnectionOptions(connection.options),
      )
        .catch((err: Error) => reject(new MongoConnectionError(err.message)))
        .then((client: TypeOrm.MongoClient) => client.close())

        // Noop when trying to close a closed connection
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        .catch(() => {})
        .then(() => resolve());
    });
  }

  /**
   * Pings a typeorm connection
   *
   * @param connection The connection which the ping should get executed
   * @param timeout The timeout how long the ping should maximum take
   *
   */
  private async pingDb(connection: TypeOrm.DataSource, timeout: number) {
    let check: Promise<any>;
    switch (connection.options.type) {
      case 'mongodb':
        check = this.checkMongoDBConnection(connection);
        break;
      case 'oracle':
        check = connection.query('SELECT 1 FROM DUAL');
        break;
      case 'sap':
        check = connection.query('SELECT now() FROM dummy');
        break;
      default:
        check = connection.query('SELECT 1');
        break;
    }
    return await promiseTimeout(timeout, check);
  }

  /**
   * Checks if responds in (default) 1000ms and
   * returns a result object corresponding to the result
   * @param key The key which will be used for the result object
   * @param options The options for the ping
   *
   * @example
   * typeOrmHealthIndicator.pingCheck('database', { timeout: 1500 });
   */
  async pingCheck<Key extends string>(
    key: Key,
    options: TypeOrmPingCheckSettings = {},
  ) {
    const check = this.healthIndicatorService.check(key);
    this.checkDependantPackages();

    const connection: TypeOrm.DataSource | null =
      options.connection || this.getContextConnection();
    const timeout = options.timeout || 1000;

    if (!connection) {
      return check.down('Connection provider not found in application context');
    }

    try {
      await this.pingDb(connection, timeout);
    } catch (err) {
      if (err instanceof PromiseTimeoutError) {
        return check.down(`timeout of ${timeout}ms exceeded`);
      }
      if (err instanceof MongoConnectionError) {
        return check.down(err.message);
      }

      return check.down(`${key} is not available`);
    }

    return check.up();
  }
}
