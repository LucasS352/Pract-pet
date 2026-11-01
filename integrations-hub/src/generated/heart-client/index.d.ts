
/**
 * Client
**/

import * as runtime from './runtime/library.js';
import $Types = runtime.Types // general types
import $Public = runtime.Types.Public
import $Utils = runtime.Types.Utils
import $Extensions = runtime.Types.Extensions
import $Result = runtime.Types.Result

export type PrismaPromise<T> = $Public.PrismaPromise<T>


/**
 * Model Tenant
 * 
 */
export type Tenant = $Result.DefaultSelection<Prisma.$TenantPayload>
/**
 * Model User
 * 
 */
export type User = $Result.DefaultSelection<Prisma.$UserPayload>
/**
 * Model MasterProduct
 * 
 */
export type MasterProduct = $Result.DefaultSelection<Prisma.$MasterProductPayload>
/**
 * Model Image
 * 
 */
export type Image = $Result.DefaultSelection<Prisma.$ImagePayload>
/**
 * Model TenantIntegration
 * 
 */
export type TenantIntegration = $Result.DefaultSelection<Prisma.$TenantIntegrationPayload>

/**
 * ##  Prisma Client ʲˢ
 *
 * Type-safe database client for TypeScript & Node.js
 * @example
 * ```
 * const prisma = new PrismaClient()
 * // Fetch zero or more Tenants
 * const tenants = await prisma.tenant.findMany()
 * ```
 *
 *
 * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
 */
export class PrismaClient<
  ClientOptions extends Prisma.PrismaClientOptions = Prisma.PrismaClientOptions,
  const U = 'log' extends keyof ClientOptions ? ClientOptions['log'] extends Array<Prisma.LogLevel | Prisma.LogDefinition> ? Prisma.GetEvents<ClientOptions['log']> : never : never,
  ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs
> {
  [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['other'] }

    /**
   * ##  Prisma Client ʲˢ
   *
   * Type-safe database client for TypeScript & Node.js
   * @example
   * ```
   * const prisma = new PrismaClient()
   * // Fetch zero or more Tenants
   * const tenants = await prisma.tenant.findMany()
   * ```
   *
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
   */

  constructor(optionsArg ?: Prisma.Subset<ClientOptions, Prisma.PrismaClientOptions>);
  $on<V extends U>(eventType: V, callback: (event: V extends 'query' ? Prisma.QueryEvent : Prisma.LogEvent) => void): PrismaClient;

  /**
   * Connect with the database
   */
  $connect(): $Utils.JsPromise<void>;

  /**
   * Disconnect from the database
   */
  $disconnect(): $Utils.JsPromise<void>;

/**
   * Executes a prepared raw query and returns the number of affected rows.
   * @example
   * ```
   * const result = await prisma.$executeRaw`UPDATE User SET cool = ${true} WHERE email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Executes a raw query and returns the number of affected rows.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$executeRawUnsafe('UPDATE User SET cool = $1 WHERE email = $2 ;', true, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Performs a prepared raw query and returns the `SELECT` data.
   * @example
   * ```
   * const result = await prisma.$queryRaw`SELECT * FROM User WHERE id = ${1} OR email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<T>;

  /**
   * Performs a raw query and returns the `SELECT` data.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$queryRawUnsafe('SELECT * FROM User WHERE id = $1 OR email = $2;', 1, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<T>;


  /**
   * Allows the running of a sequence of read/write operations that are guaranteed to either succeed or fail as a whole.
   * @example
   * ```
   * const [george, bob, alice] = await prisma.$transaction([
   *   prisma.user.create({ data: { name: 'George' } }),
   *   prisma.user.create({ data: { name: 'Bob' } }),
   *   prisma.user.create({ data: { name: 'Alice' } }),
   * ])
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/concepts/components/prisma-client/transactions).
   */
  $transaction<P extends Prisma.PrismaPromise<any>[]>(arg: [...P], options?: { isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<runtime.Types.Utils.UnwrapTuple<P>>

  $transaction<R>(fn: (prisma: Omit<PrismaClient, runtime.ITXClientDenyList>) => $Utils.JsPromise<R>, options?: { maxWait?: number, timeout?: number, isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<R>


  $extends: $Extensions.ExtendsHook<"extends", Prisma.TypeMapCb<ClientOptions>, ExtArgs, $Utils.Call<Prisma.TypeMapCb<ClientOptions>, {
    extArgs: ExtArgs
  }>>

      /**
   * `prisma.tenant`: Exposes CRUD operations for the **Tenant** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Tenants
    * const tenants = await prisma.tenant.findMany()
    * ```
    */
  get tenant(): Prisma.TenantDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.user`: Exposes CRUD operations for the **User** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Users
    * const users = await prisma.user.findMany()
    * ```
    */
  get user(): Prisma.UserDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.masterProduct`: Exposes CRUD operations for the **MasterProduct** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more MasterProducts
    * const masterProducts = await prisma.masterProduct.findMany()
    * ```
    */
  get masterProduct(): Prisma.MasterProductDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.image`: Exposes CRUD operations for the **Image** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Images
    * const images = await prisma.image.findMany()
    * ```
    */
  get image(): Prisma.ImageDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.tenantIntegration`: Exposes CRUD operations for the **TenantIntegration** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more TenantIntegrations
    * const tenantIntegrations = await prisma.tenantIntegration.findMany()
    * ```
    */
  get tenantIntegration(): Prisma.TenantIntegrationDelegate<ExtArgs, ClientOptions>;
}

export namespace Prisma {
  export import DMMF = runtime.DMMF

  export type PrismaPromise<T> = $Public.PrismaPromise<T>

  /**
   * Validator
   */
  export import validator = runtime.Public.validator

  /**
   * Prisma Errors
   */
  export import PrismaClientKnownRequestError = runtime.PrismaClientKnownRequestError
  export import PrismaClientUnknownRequestError = runtime.PrismaClientUnknownRequestError
  export import PrismaClientRustPanicError = runtime.PrismaClientRustPanicError
  export import PrismaClientInitializationError = runtime.PrismaClientInitializationError
  export import PrismaClientValidationError = runtime.PrismaClientValidationError

  /**
   * Re-export of sql-template-tag
   */
  export import sql = runtime.sqltag
  export import empty = runtime.empty
  export import join = runtime.join
  export import raw = runtime.raw
  export import Sql = runtime.Sql



  /**
   * Decimal.js
   */
  export import Decimal = runtime.Decimal

  export type DecimalJsLike = runtime.DecimalJsLike

  /**
   * Metrics
   */
  export type Metrics = runtime.Metrics
  export type Metric<T> = runtime.Metric<T>
  export type MetricHistogram = runtime.MetricHistogram
  export type MetricHistogramBucket = runtime.MetricHistogramBucket

  /**
  * Extensions
  */
  export import Extension = $Extensions.UserArgs
  export import getExtensionContext = runtime.Extensions.getExtensionContext
  export import Args = $Public.Args
  export import Payload = $Public.Payload
  export import Result = $Public.Result
  export import Exact = $Public.Exact

  /**
   * Prisma Client JS version: 6.19.2
   * Query Engine version: c2990dca591cba766e3b7ef5d9e8a84796e47ab7
   */
  export type PrismaVersion = {
    client: string
  }

  export const prismaVersion: PrismaVersion

  /**
   * Utility Types
   */


  export import Bytes = runtime.Bytes
  export import JsonObject = runtime.JsonObject
  export import JsonArray = runtime.JsonArray
  export import JsonValue = runtime.JsonValue
  export import InputJsonObject = runtime.InputJsonObject
  export import InputJsonArray = runtime.InputJsonArray
  export import InputJsonValue = runtime.InputJsonValue

  /**
   * Types of the values used to represent different kinds of `null` values when working with JSON fields.
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  namespace NullTypes {
    /**
    * Type of `Prisma.DbNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.DbNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class DbNull {
      private DbNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.JsonNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.JsonNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class JsonNull {
      private JsonNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.AnyNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.AnyNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class AnyNull {
      private AnyNull: never
      private constructor()
    }
  }

  /**
   * Helper for filtering JSON entries that have `null` on the database (empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const DbNull: NullTypes.DbNull

  /**
   * Helper for filtering JSON entries that have JSON `null` values (not empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const JsonNull: NullTypes.JsonNull

  /**
   * Helper for filtering JSON entries that are `Prisma.DbNull` or `Prisma.JsonNull`
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const AnyNull: NullTypes.AnyNull

  type SelectAndInclude = {
    select: any
    include: any
  }

  type SelectAndOmit = {
    select: any
    omit: any
  }

  /**
   * Get the type of the value, that the Promise holds.
   */
  export type PromiseType<T extends PromiseLike<any>> = T extends PromiseLike<infer U> ? U : T;

  /**
   * Get the return type of a function which returns a Promise.
   */
  export type PromiseReturnType<T extends (...args: any) => $Utils.JsPromise<any>> = PromiseType<ReturnType<T>>

  /**
   * From T, pick a set of properties whose keys are in the union K
   */
  type Prisma__Pick<T, K extends keyof T> = {
      [P in K]: T[P];
  };


  export type Enumerable<T> = T | Array<T>;

  export type RequiredKeys<T> = {
    [K in keyof T]-?: {} extends Prisma__Pick<T, K> ? never : K
  }[keyof T]

  export type TruthyKeys<T> = keyof {
    [K in keyof T as T[K] extends false | undefined | null ? never : K]: K
  }

  export type TrueKeys<T> = TruthyKeys<Prisma__Pick<T, RequiredKeys<T>>>

  /**
   * Subset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection
   */
  export type Subset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never;
  };

  /**
   * SelectSubset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection.
   * Additionally, it validates, if both select and include are present. If the case, it errors.
   */
  export type SelectSubset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    (T extends SelectAndInclude
      ? 'Please either choose `select` or `include`.'
      : T extends SelectAndOmit
        ? 'Please either choose `select` or `omit`.'
        : {})

  /**
   * Subset + Intersection
   * @desc From `T` pick properties that exist in `U` and intersect `K`
   */
  export type SubsetIntersection<T, U, K> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    K

  type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };

  /**
   * XOR is needed to have a real mutually exclusive union type
   * https://stackoverflow.com/questions/42123407/does-typescript-support-mutually-exclusive-types
   */
  type XOR<T, U> =
    T extends object ?
    U extends object ?
      (Without<T, U> & U) | (Without<U, T> & T)
    : U : T


  /**
   * Is T a Record?
   */
  type IsObject<T extends any> = T extends Array<any>
  ? False
  : T extends Date
  ? False
  : T extends Uint8Array
  ? False
  : T extends BigInt
  ? False
  : T extends object
  ? True
  : False


  /**
   * If it's T[], return T
   */
  export type UnEnumerate<T extends unknown> = T extends Array<infer U> ? U : T

  /**
   * From ts-toolbelt
   */

  type __Either<O extends object, K extends Key> = Omit<O, K> &
    {
      // Merge all but K
      [P in K]: Prisma__Pick<O, P & keyof O> // With K possibilities
    }[K]

  type EitherStrict<O extends object, K extends Key> = Strict<__Either<O, K>>

  type EitherLoose<O extends object, K extends Key> = ComputeRaw<__Either<O, K>>

  type _Either<
    O extends object,
    K extends Key,
    strict extends Boolean
  > = {
    1: EitherStrict<O, K>
    0: EitherLoose<O, K>
  }[strict]

  type Either<
    O extends object,
    K extends Key,
    strict extends Boolean = 1
  > = O extends unknown ? _Either<O, K, strict> : never

  export type Union = any

  type PatchUndefined<O extends object, O1 extends object> = {
    [K in keyof O]: O[K] extends undefined ? At<O1, K> : O[K]
  } & {}

  /** Helper Types for "Merge" **/
  export type IntersectOf<U extends Union> = (
    U extends unknown ? (k: U) => void : never
  ) extends (k: infer I) => void
    ? I
    : never

  export type Overwrite<O extends object, O1 extends object> = {
      [K in keyof O]: K extends keyof O1 ? O1[K] : O[K];
  } & {};

  type _Merge<U extends object> = IntersectOf<Overwrite<U, {
      [K in keyof U]-?: At<U, K>;
  }>>;

  type Key = string | number | symbol;
  type AtBasic<O extends object, K extends Key> = K extends keyof O ? O[K] : never;
  type AtStrict<O extends object, K extends Key> = O[K & keyof O];
  type AtLoose<O extends object, K extends Key> = O extends unknown ? AtStrict<O, K> : never;
  export type At<O extends object, K extends Key, strict extends Boolean = 1> = {
      1: AtStrict<O, K>;
      0: AtLoose<O, K>;
  }[strict];

  export type ComputeRaw<A extends any> = A extends Function ? A : {
    [K in keyof A]: A[K];
  } & {};

  export type OptionalFlat<O> = {
    [K in keyof O]?: O[K];
  } & {};

  type _Record<K extends keyof any, T> = {
    [P in K]: T;
  };

  // cause typescript not to expand types and preserve names
  type NoExpand<T> = T extends unknown ? T : never;

  // this type assumes the passed object is entirely optional
  type AtLeast<O extends object, K extends string> = NoExpand<
    O extends unknown
    ? | (K extends keyof O ? { [P in K]: O[P] } & O : O)
      | {[P in keyof O as P extends K ? P : never]-?: O[P]} & O
    : never>;

  type _Strict<U, _U = U> = U extends unknown ? U & OptionalFlat<_Record<Exclude<Keys<_U>, keyof U>, never>> : never;

  export type Strict<U extends object> = ComputeRaw<_Strict<U>>;
  /** End Helper Types for "Merge" **/

  export type Merge<U extends object> = ComputeRaw<_Merge<Strict<U>>>;

  /**
  A [[Boolean]]
  */
  export type Boolean = True | False

  // /**
  // 1
  // */
  export type True = 1

  /**
  0
  */
  export type False = 0

  export type Not<B extends Boolean> = {
    0: 1
    1: 0
  }[B]

  export type Extends<A1 extends any, A2 extends any> = [A1] extends [never]
    ? 0 // anything `never` is false
    : A1 extends A2
    ? 1
    : 0

  export type Has<U extends Union, U1 extends Union> = Not<
    Extends<Exclude<U1, U>, U1>
  >

  export type Or<B1 extends Boolean, B2 extends Boolean> = {
    0: {
      0: 0
      1: 1
    }
    1: {
      0: 1
      1: 1
    }
  }[B1][B2]

  export type Keys<U extends Union> = U extends unknown ? keyof U : never

  type Cast<A, B> = A extends B ? A : B;

  export const type: unique symbol;



  /**
   * Used by group by
   */

  export type GetScalarType<T, O> = O extends object ? {
    [P in keyof T]: P extends keyof O
      ? O[P]
      : never
  } : never

  type FieldPaths<
    T,
    U = Omit<T, '_avg' | '_sum' | '_count' | '_min' | '_max'>
  > = IsObject<T> extends True ? U : T

  type GetHavingFields<T> = {
    [K in keyof T]: Or<
      Or<Extends<'OR', K>, Extends<'AND', K>>,
      Extends<'NOT', K>
    > extends True
      ? // infer is only needed to not hit TS limit
        // based on the brilliant idea of Pierre-Antoine Mills
        // https://github.com/microsoft/TypeScript/issues/30188#issuecomment-478938437
        T[K] extends infer TK
        ? GetHavingFields<UnEnumerate<TK> extends object ? Merge<UnEnumerate<TK>> : never>
        : never
      : {} extends FieldPaths<T[K]>
      ? never
      : K
  }[keyof T]

  /**
   * Convert tuple to union
   */
  type _TupleToUnion<T> = T extends (infer E)[] ? E : never
  type TupleToUnion<K extends readonly any[]> = _TupleToUnion<K>
  type MaybeTupleToUnion<T> = T extends any[] ? TupleToUnion<T> : T

  /**
   * Like `Pick`, but additionally can also accept an array of keys
   */
  type PickEnumerable<T, K extends Enumerable<keyof T> | keyof T> = Prisma__Pick<T, MaybeTupleToUnion<K>>

  /**
   * Exclude all keys with underscores
   */
  type ExcludeUnderscoreKeys<T extends string> = T extends `_${string}` ? never : T


  export type FieldRef<Model, FieldType> = runtime.FieldRef<Model, FieldType>

  type FieldRefInputType<Model, FieldType> = Model extends never ? never : FieldRef<Model, FieldType>


  export const ModelName: {
    Tenant: 'Tenant',
    User: 'User',
    MasterProduct: 'MasterProduct',
    Image: 'Image',
    TenantIntegration: 'TenantIntegration'
  };

  export type ModelName = (typeof ModelName)[keyof typeof ModelName]


  export type Datasources = {
    db?: Datasource
  }

  interface TypeMapCb<ClientOptions = {}> extends $Utils.Fn<{extArgs: $Extensions.InternalArgs }, $Utils.Record<string, any>> {
    returns: Prisma.TypeMap<this['params']['extArgs'], ClientOptions extends { omit: infer OmitOptions } ? OmitOptions : {}>
  }

  export type TypeMap<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> = {
    globalOmitOptions: {
      omit: GlobalOmitOptions
    }
    meta: {
      modelProps: "tenant" | "user" | "masterProduct" | "image" | "tenantIntegration"
      txIsolationLevel: Prisma.TransactionIsolationLevel
    }
    model: {
      Tenant: {
        payload: Prisma.$TenantPayload<ExtArgs>
        fields: Prisma.TenantFieldRefs
        operations: {
          findUnique: {
            args: Prisma.TenantFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.TenantFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantPayload>
          }
          findFirst: {
            args: Prisma.TenantFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.TenantFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantPayload>
          }
          findMany: {
            args: Prisma.TenantFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantPayload>[]
          }
          create: {
            args: Prisma.TenantCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantPayload>
          }
          createMany: {
            args: Prisma.TenantCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          delete: {
            args: Prisma.TenantDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantPayload>
          }
          update: {
            args: Prisma.TenantUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantPayload>
          }
          deleteMany: {
            args: Prisma.TenantDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.TenantUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.TenantUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantPayload>
          }
          aggregate: {
            args: Prisma.TenantAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateTenant>
          }
          groupBy: {
            args: Prisma.TenantGroupByArgs<ExtArgs>
            result: $Utils.Optional<TenantGroupByOutputType>[]
          }
          count: {
            args: Prisma.TenantCountArgs<ExtArgs>
            result: $Utils.Optional<TenantCountAggregateOutputType> | number
          }
        }
      }
      User: {
        payload: Prisma.$UserPayload<ExtArgs>
        fields: Prisma.UserFieldRefs
        operations: {
          findUnique: {
            args: Prisma.UserFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.UserFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          findFirst: {
            args: Prisma.UserFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.UserFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          findMany: {
            args: Prisma.UserFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>[]
          }
          create: {
            args: Prisma.UserCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          createMany: {
            args: Prisma.UserCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          delete: {
            args: Prisma.UserDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          update: {
            args: Prisma.UserUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          deleteMany: {
            args: Prisma.UserDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.UserUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.UserUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          aggregate: {
            args: Prisma.UserAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateUser>
          }
          groupBy: {
            args: Prisma.UserGroupByArgs<ExtArgs>
            result: $Utils.Optional<UserGroupByOutputType>[]
          }
          count: {
            args: Prisma.UserCountArgs<ExtArgs>
            result: $Utils.Optional<UserCountAggregateOutputType> | number
          }
        }
      }
      MasterProduct: {
        payload: Prisma.$MasterProductPayload<ExtArgs>
        fields: Prisma.MasterProductFieldRefs
        operations: {
          findUnique: {
            args: Prisma.MasterProductFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MasterProductPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.MasterProductFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MasterProductPayload>
          }
          findFirst: {
            args: Prisma.MasterProductFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MasterProductPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.MasterProductFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MasterProductPayload>
          }
          findMany: {
            args: Prisma.MasterProductFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MasterProductPayload>[]
          }
          create: {
            args: Prisma.MasterProductCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MasterProductPayload>
          }
          createMany: {
            args: Prisma.MasterProductCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          delete: {
            args: Prisma.MasterProductDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MasterProductPayload>
          }
          update: {
            args: Prisma.MasterProductUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MasterProductPayload>
          }
          deleteMany: {
            args: Prisma.MasterProductDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.MasterProductUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.MasterProductUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$MasterProductPayload>
          }
          aggregate: {
            args: Prisma.MasterProductAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateMasterProduct>
          }
          groupBy: {
            args: Prisma.MasterProductGroupByArgs<ExtArgs>
            result: $Utils.Optional<MasterProductGroupByOutputType>[]
          }
          count: {
            args: Prisma.MasterProductCountArgs<ExtArgs>
            result: $Utils.Optional<MasterProductCountAggregateOutputType> | number
          }
        }
      }
      Image: {
        payload: Prisma.$ImagePayload<ExtArgs>
        fields: Prisma.ImageFieldRefs
        operations: {
          findUnique: {
            args: Prisma.ImageFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ImagePayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.ImageFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ImagePayload>
          }
          findFirst: {
            args: Prisma.ImageFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ImagePayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.ImageFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ImagePayload>
          }
          findMany: {
            args: Prisma.ImageFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ImagePayload>[]
          }
          create: {
            args: Prisma.ImageCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ImagePayload>
          }
          createMany: {
            args: Prisma.ImageCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          delete: {
            args: Prisma.ImageDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ImagePayload>
          }
          update: {
            args: Prisma.ImageUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ImagePayload>
          }
          deleteMany: {
            args: Prisma.ImageDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.ImageUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.ImageUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ImagePayload>
          }
          aggregate: {
            args: Prisma.ImageAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateImage>
          }
          groupBy: {
            args: Prisma.ImageGroupByArgs<ExtArgs>
            result: $Utils.Optional<ImageGroupByOutputType>[]
          }
          count: {
            args: Prisma.ImageCountArgs<ExtArgs>
            result: $Utils.Optional<ImageCountAggregateOutputType> | number
          }
        }
      }
      TenantIntegration: {
        payload: Prisma.$TenantIntegrationPayload<ExtArgs>
        fields: Prisma.TenantIntegrationFieldRefs
        operations: {
          findUnique: {
            args: Prisma.TenantIntegrationFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantIntegrationPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.TenantIntegrationFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantIntegrationPayload>
          }
          findFirst: {
            args: Prisma.TenantIntegrationFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantIntegrationPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.TenantIntegrationFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantIntegrationPayload>
          }
          findMany: {
            args: Prisma.TenantIntegrationFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantIntegrationPayload>[]
          }
          create: {
            args: Prisma.TenantIntegrationCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantIntegrationPayload>
          }
          createMany: {
            args: Prisma.TenantIntegrationCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          delete: {
            args: Prisma.TenantIntegrationDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantIntegrationPayload>
          }
          update: {
            args: Prisma.TenantIntegrationUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantIntegrationPayload>
          }
          deleteMany: {
            args: Prisma.TenantIntegrationDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.TenantIntegrationUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.TenantIntegrationUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TenantIntegrationPayload>
          }
          aggregate: {
            args: Prisma.TenantIntegrationAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateTenantIntegration>
          }
          groupBy: {
            args: Prisma.TenantIntegrationGroupByArgs<ExtArgs>
            result: $Utils.Optional<TenantIntegrationGroupByOutputType>[]
          }
          count: {
            args: Prisma.TenantIntegrationCountArgs<ExtArgs>
            result: $Utils.Optional<TenantIntegrationCountAggregateOutputType> | number
          }
        }
      }
    }
  } & {
    other: {
      payload: any
      operations: {
        $executeRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $executeRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
        $queryRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $queryRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
      }
    }
  }
  export const defineExtension: $Extensions.ExtendsHook<"define", Prisma.TypeMapCb, $Extensions.DefaultArgs>
  export type DefaultPrismaClient = PrismaClient
  export type ErrorFormat = 'pretty' | 'colorless' | 'minimal'
  export interface PrismaClientOptions {
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasources?: Datasources
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasourceUrl?: string
    /**
     * @default "colorless"
     */
    errorFormat?: ErrorFormat
    /**
     * @example
     * ```
     * // Shorthand for `emit: 'stdout'`
     * log: ['query', 'info', 'warn', 'error']
     * 
     * // Emit as events only
     * log: [
     *   { emit: 'event', level: 'query' },
     *   { emit: 'event', level: 'info' },
     *   { emit: 'event', level: 'warn' }
     *   { emit: 'event', level: 'error' }
     * ]
     * 
     * / Emit as events and log to stdout
     * og: [
     *  { emit: 'stdout', level: 'query' },
     *  { emit: 'stdout', level: 'info' },
     *  { emit: 'stdout', level: 'warn' }
     *  { emit: 'stdout', level: 'error' }
     * 
     * ```
     * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/logging#the-log-option).
     */
    log?: (LogLevel | LogDefinition)[]
    /**
     * The default values for transactionOptions
     * maxWait ?= 2000
     * timeout ?= 5000
     */
    transactionOptions?: {
      maxWait?: number
      timeout?: number
      isolationLevel?: Prisma.TransactionIsolationLevel
    }
    /**
     * Instance of a Driver Adapter, e.g., like one provided by `@prisma/adapter-planetscale`
     */
    adapter?: runtime.SqlDriverAdapterFactory | null
    /**
     * Global configuration for omitting model fields by default.
     * 
     * @example
     * ```
     * const prisma = new PrismaClient({
     *   omit: {
     *     user: {
     *       password: true
     *     }
     *   }
     * })
     * ```
     */
    omit?: Prisma.GlobalOmitConfig
  }
  export type GlobalOmitConfig = {
    tenant?: TenantOmit
    user?: UserOmit
    masterProduct?: MasterProductOmit
    image?: ImageOmit
    tenantIntegration?: TenantIntegrationOmit
  }

  /* Types for Logging */
  export type LogLevel = 'info' | 'query' | 'warn' | 'error'
  export type LogDefinition = {
    level: LogLevel
    emit: 'stdout' | 'event'
  }

  export type CheckIsLogLevel<T> = T extends LogLevel ? T : never;

  export type GetLogType<T> = CheckIsLogLevel<
    T extends LogDefinition ? T['level'] : T
  >;

  export type GetEvents<T extends any[]> = T extends Array<LogLevel | LogDefinition>
    ? GetLogType<T[number]>
    : never;

  export type QueryEvent = {
    timestamp: Date
    query: string
    params: string
    duration: number
    target: string
  }

  export type LogEvent = {
    timestamp: Date
    message: string
    target: string
  }
  /* End Types for Logging */


  export type PrismaAction =
    | 'findUnique'
    | 'findUniqueOrThrow'
    | 'findMany'
    | 'findFirst'
    | 'findFirstOrThrow'
    | 'create'
    | 'createMany'
    | 'createManyAndReturn'
    | 'update'
    | 'updateMany'
    | 'updateManyAndReturn'
    | 'upsert'
    | 'delete'
    | 'deleteMany'
    | 'executeRaw'
    | 'queryRaw'
    | 'aggregate'
    | 'count'
    | 'runCommandRaw'
    | 'findRaw'
    | 'groupBy'

  // tested in getLogLevel.test.ts
  export function getLogLevel(log: Array<LogLevel | LogDefinition>): LogLevel | undefined;

  /**
   * `PrismaClient` proxy available in interactive transactions.
   */
  export type TransactionClient = Omit<Prisma.DefaultPrismaClient, runtime.ITXClientDenyList>

  export type Datasource = {
    url?: string
  }

  /**
   * Count Types
   */


  /**
   * Count Type TenantCountOutputType
   */

  export type TenantCountOutputType = {
    users: number
    tenantIntegrations: number
  }

  export type TenantCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    users?: boolean | TenantCountOutputTypeCountUsersArgs
    tenantIntegrations?: boolean | TenantCountOutputTypeCountTenantIntegrationsArgs
  }

  // Custom InputTypes
  /**
   * TenantCountOutputType without action
   */
  export type TenantCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TenantCountOutputType
     */
    select?: TenantCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * TenantCountOutputType without action
   */
  export type TenantCountOutputTypeCountUsersArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: UserWhereInput
  }

  /**
   * TenantCountOutputType without action
   */
  export type TenantCountOutputTypeCountTenantIntegrationsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: TenantIntegrationWhereInput
  }


  /**
   * Models
   */

  /**
   * Model Tenant
   */

  export type AggregateTenant = {
    _count: TenantCountAggregateOutputType | null
    _avg: TenantAvgAggregateOutputType | null
    _sum: TenantSumAggregateOutputType | null
    _min: TenantMinAggregateOutputType | null
    _max: TenantMaxAggregateOutputType | null
  }

  export type TenantAvgAggregateOutputType = {
    crt: number | null
    nfceSerie: number | null
    nfceAmbiente: number | null
    mensalidadeValor: Decimal | null
  }

  export type TenantSumAggregateOutputType = {
    crt: number | null
    nfceSerie: number | null
    nfceAmbiente: number | null
    mensalidadeValor: Decimal | null
  }

  export type TenantMinAggregateOutputType = {
    id: string | null
    databaseName: string | null
    databaseUrl: string | null
    name: string | null
    status: string | null
    logoUrl: string | null
    razaoSocial: string | null
    nomeFantasia: string | null
    cnpj: string | null
    ie: string | null
    im: string | null
    crt: number | null
    logradouro: string | null
    numero: string | null
    complemento: string | null
    bairro: string | null
    municipio: string | null
    codMunicipio: string | null
    uf: string | null
    cep: string | null
    telefone: string | null
    emailContador: string | null
    nfceAtivo: boolean | null
    nfceAutoSync: boolean | null
    nfceSerie: number | null
    nfceAmbiente: number | null
    nfceCsc: string | null
    nfceIdCsc: string | null
    certPfx: Bytes | null
    certSenha: string | null
    certValidade: Date | null
    cosmosApiKey: string | null
    mensalidadeValor: Decimal | null
    mensalidadeVencimento: Date | null
    createdAt: Date | null
    updatedAt: Date | null
    termsAcceptedAt: Date | null
  }

  export type TenantMaxAggregateOutputType = {
    id: string | null
    databaseName: string | null
    databaseUrl: string | null
    name: string | null
    status: string | null
    logoUrl: string | null
    razaoSocial: string | null
    nomeFantasia: string | null
    cnpj: string | null
    ie: string | null
    im: string | null
    crt: number | null
    logradouro: string | null
    numero: string | null
    complemento: string | null
    bairro: string | null
    municipio: string | null
    codMunicipio: string | null
    uf: string | null
    cep: string | null
    telefone: string | null
    emailContador: string | null
    nfceAtivo: boolean | null
    nfceAutoSync: boolean | null
    nfceSerie: number | null
    nfceAmbiente: number | null
    nfceCsc: string | null
    nfceIdCsc: string | null
    certPfx: Bytes | null
    certSenha: string | null
    certValidade: Date | null
    cosmosApiKey: string | null
    mensalidadeValor: Decimal | null
    mensalidadeVencimento: Date | null
    createdAt: Date | null
    updatedAt: Date | null
    termsAcceptedAt: Date | null
  }

  export type TenantCountAggregateOutputType = {
    id: number
    databaseName: number
    databaseUrl: number
    name: number
    status: number
    logoUrl: number
    modulos: number
    razaoSocial: number
    nomeFantasia: number
    cnpj: number
    ie: number
    im: number
    crt: number
    logradouro: number
    numero: number
    complemento: number
    bairro: number
    municipio: number
    codMunicipio: number
    uf: number
    cep: number
    telefone: number
    emailContador: number
    nfceAtivo: number
    nfceAutoSync: number
    nfceSerie: number
    nfceAmbiente: number
    nfceCsc: number
    nfceIdCsc: number
    certPfx: number
    certSenha: number
    certValidade: number
    cosmosApiKey: number
    mensalidadeValor: number
    mensalidadeVencimento: number
    createdAt: number
    updatedAt: number
    termsAcceptedAt: number
    _all: number
  }


  export type TenantAvgAggregateInputType = {
    crt?: true
    nfceSerie?: true
    nfceAmbiente?: true
    mensalidadeValor?: true
  }

  export type TenantSumAggregateInputType = {
    crt?: true
    nfceSerie?: true
    nfceAmbiente?: true
    mensalidadeValor?: true
  }

  export type TenantMinAggregateInputType = {
    id?: true
    databaseName?: true
    databaseUrl?: true
    name?: true
    status?: true
    logoUrl?: true
    razaoSocial?: true
    nomeFantasia?: true
    cnpj?: true
    ie?: true
    im?: true
    crt?: true
    logradouro?: true
    numero?: true
    complemento?: true
    bairro?: true
    municipio?: true
    codMunicipio?: true
    uf?: true
    cep?: true
    telefone?: true
    emailContador?: true
    nfceAtivo?: true
    nfceAutoSync?: true
    nfceSerie?: true
    nfceAmbiente?: true
    nfceCsc?: true
    nfceIdCsc?: true
    certPfx?: true
    certSenha?: true
    certValidade?: true
    cosmosApiKey?: true
    mensalidadeValor?: true
    mensalidadeVencimento?: true
    createdAt?: true
    updatedAt?: true
    termsAcceptedAt?: true
  }

  export type TenantMaxAggregateInputType = {
    id?: true
    databaseName?: true
    databaseUrl?: true
    name?: true
    status?: true
    logoUrl?: true
    razaoSocial?: true
    nomeFantasia?: true
    cnpj?: true
    ie?: true
    im?: true
    crt?: true
    logradouro?: true
    numero?: true
    complemento?: true
    bairro?: true
    municipio?: true
    codMunicipio?: true
    uf?: true
    cep?: true
    telefone?: true
    emailContador?: true
    nfceAtivo?: true
    nfceAutoSync?: true
    nfceSerie?: true
    nfceAmbiente?: true
    nfceCsc?: true
    nfceIdCsc?: true
    certPfx?: true
    certSenha?: true
    certValidade?: true
    cosmosApiKey?: true
    mensalidadeValor?: true
    mensalidadeVencimento?: true
    createdAt?: true
    updatedAt?: true
    termsAcceptedAt?: true
  }

  export type TenantCountAggregateInputType = {
    id?: true
    databaseName?: true
    databaseUrl?: true
    name?: true
    status?: true
    logoUrl?: true
    modulos?: true
    razaoSocial?: true
    nomeFantasia?: true
    cnpj?: true
    ie?: true
    im?: true
    crt?: true
    logradouro?: true
    numero?: true
    complemento?: true
    bairro?: true
    municipio?: true
    codMunicipio?: true
    uf?: true
    cep?: true
    telefone?: true
    emailContador?: true
    nfceAtivo?: true
    nfceAutoSync?: true
    nfceSerie?: true
    nfceAmbiente?: true
    nfceCsc?: true
    nfceIdCsc?: true
    certPfx?: true
    certSenha?: true
    certValidade?: true
    cosmosApiKey?: true
    mensalidadeValor?: true
    mensalidadeVencimento?: true
    createdAt?: true
    updatedAt?: true
    termsAcceptedAt?: true
    _all?: true
  }

  export type TenantAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Tenant to aggregate.
     */
    where?: TenantWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Tenants to fetch.
     */
    orderBy?: TenantOrderByWithRelationInput | TenantOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: TenantWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Tenants from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Tenants.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Tenants
    **/
    _count?: true | TenantCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: TenantAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: TenantSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: TenantMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: TenantMaxAggregateInputType
  }

  export type GetTenantAggregateType<T extends TenantAggregateArgs> = {
        [P in keyof T & keyof AggregateTenant]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateTenant[P]>
      : GetScalarType<T[P], AggregateTenant[P]>
  }




  export type TenantGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: TenantWhereInput
    orderBy?: TenantOrderByWithAggregationInput | TenantOrderByWithAggregationInput[]
    by: TenantScalarFieldEnum[] | TenantScalarFieldEnum
    having?: TenantScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: TenantCountAggregateInputType | true
    _avg?: TenantAvgAggregateInputType
    _sum?: TenantSumAggregateInputType
    _min?: TenantMinAggregateInputType
    _max?: TenantMaxAggregateInputType
  }

  export type TenantGroupByOutputType = {
    id: string
    databaseName: string
    databaseUrl: string
    name: string
    status: string
    logoUrl: string | null
    modulos: JsonValue | null
    razaoSocial: string | null
    nomeFantasia: string | null
    cnpj: string | null
    ie: string | null
    im: string | null
    crt: number
    logradouro: string | null
    numero: string | null
    complemento: string | null
    bairro: string | null
    municipio: string | null
    codMunicipio: string | null
    uf: string | null
    cep: string | null
    telefone: string | null
    emailContador: string | null
    nfceAtivo: boolean
    nfceAutoSync: boolean
    nfceSerie: number
    nfceAmbiente: number
    nfceCsc: string | null
    nfceIdCsc: string | null
    certPfx: Bytes | null
    certSenha: string | null
    certValidade: Date | null
    cosmosApiKey: string | null
    mensalidadeValor: Decimal | null
    mensalidadeVencimento: Date | null
    createdAt: Date
    updatedAt: Date
    termsAcceptedAt: Date | null
    _count: TenantCountAggregateOutputType | null
    _avg: TenantAvgAggregateOutputType | null
    _sum: TenantSumAggregateOutputType | null
    _min: TenantMinAggregateOutputType | null
    _max: TenantMaxAggregateOutputType | null
  }

  type GetTenantGroupByPayload<T extends TenantGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<TenantGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof TenantGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], TenantGroupByOutputType[P]>
            : GetScalarType<T[P], TenantGroupByOutputType[P]>
        }
      >
    >


  export type TenantSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    databaseName?: boolean
    databaseUrl?: boolean
    name?: boolean
    status?: boolean
    logoUrl?: boolean
    modulos?: boolean
    razaoSocial?: boolean
    nomeFantasia?: boolean
    cnpj?: boolean
    ie?: boolean
    im?: boolean
    crt?: boolean
    logradouro?: boolean
    numero?: boolean
    complemento?: boolean
    bairro?: boolean
    municipio?: boolean
    codMunicipio?: boolean
    uf?: boolean
    cep?: boolean
    telefone?: boolean
    emailContador?: boolean
    nfceAtivo?: boolean
    nfceAutoSync?: boolean
    nfceSerie?: boolean
    nfceAmbiente?: boolean
    nfceCsc?: boolean
    nfceIdCsc?: boolean
    certPfx?: boolean
    certSenha?: boolean
    certValidade?: boolean
    cosmosApiKey?: boolean
    mensalidadeValor?: boolean
    mensalidadeVencimento?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    termsAcceptedAt?: boolean
    users?: boolean | Tenant$usersArgs<ExtArgs>
    tenantIntegrations?: boolean | Tenant$tenantIntegrationsArgs<ExtArgs>
    _count?: boolean | TenantCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["tenant"]>



  export type TenantSelectScalar = {
    id?: boolean
    databaseName?: boolean
    databaseUrl?: boolean
    name?: boolean
    status?: boolean
    logoUrl?: boolean
    modulos?: boolean
    razaoSocial?: boolean
    nomeFantasia?: boolean
    cnpj?: boolean
    ie?: boolean
    im?: boolean
    crt?: boolean
    logradouro?: boolean
    numero?: boolean
    complemento?: boolean
    bairro?: boolean
    municipio?: boolean
    codMunicipio?: boolean
    uf?: boolean
    cep?: boolean
    telefone?: boolean
    emailContador?: boolean
    nfceAtivo?: boolean
    nfceAutoSync?: boolean
    nfceSerie?: boolean
    nfceAmbiente?: boolean
    nfceCsc?: boolean
    nfceIdCsc?: boolean
    certPfx?: boolean
    certSenha?: boolean
    certValidade?: boolean
    cosmosApiKey?: boolean
    mensalidadeValor?: boolean
    mensalidadeVencimento?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    termsAcceptedAt?: boolean
  }

  export type TenantOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "databaseName" | "databaseUrl" | "name" | "status" | "logoUrl" | "modulos" | "razaoSocial" | "nomeFantasia" | "cnpj" | "ie" | "im" | "crt" | "logradouro" | "numero" | "complemento" | "bairro" | "municipio" | "codMunicipio" | "uf" | "cep" | "telefone" | "emailContador" | "nfceAtivo" | "nfceAutoSync" | "nfceSerie" | "nfceAmbiente" | "nfceCsc" | "nfceIdCsc" | "certPfx" | "certSenha" | "certValidade" | "cosmosApiKey" | "mensalidadeValor" | "mensalidadeVencimento" | "createdAt" | "updatedAt" | "termsAcceptedAt", ExtArgs["result"]["tenant"]>
  export type TenantInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    users?: boolean | Tenant$usersArgs<ExtArgs>
    tenantIntegrations?: boolean | Tenant$tenantIntegrationsArgs<ExtArgs>
    _count?: boolean | TenantCountOutputTypeDefaultArgs<ExtArgs>
  }

  export type $TenantPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Tenant"
    objects: {
      users: Prisma.$UserPayload<ExtArgs>[]
      tenantIntegrations: Prisma.$TenantIntegrationPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      databaseName: string
      databaseUrl: string
      name: string
      status: string
      logoUrl: string | null
      modulos: Prisma.JsonValue | null
      razaoSocial: string | null
      nomeFantasia: string | null
      cnpj: string | null
      ie: string | null
      im: string | null
      crt: number
      logradouro: string | null
      numero: string | null
      complemento: string | null
      bairro: string | null
      municipio: string | null
      codMunicipio: string | null
      uf: string | null
      cep: string | null
      telefone: string | null
      emailContador: string | null
      nfceAtivo: boolean
      nfceAutoSync: boolean
      nfceSerie: number
      nfceAmbiente: number
      nfceCsc: string | null
      nfceIdCsc: string | null
      certPfx: Prisma.Bytes | null
      certSenha: string | null
      certValidade: Date | null
      cosmosApiKey: string | null
      mensalidadeValor: Prisma.Decimal | null
      mensalidadeVencimento: Date | null
      createdAt: Date
      updatedAt: Date
      termsAcceptedAt: Date | null
    }, ExtArgs["result"]["tenant"]>
    composites: {}
  }

  type TenantGetPayload<S extends boolean | null | undefined | TenantDefaultArgs> = $Result.GetResult<Prisma.$TenantPayload, S>

  type TenantCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<TenantFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: TenantCountAggregateInputType | true
    }

  export interface TenantDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Tenant'], meta: { name: 'Tenant' } }
    /**
     * Find zero or one Tenant that matches the filter.
     * @param {TenantFindUniqueArgs} args - Arguments to find a Tenant
     * @example
     * // Get one Tenant
     * const tenant = await prisma.tenant.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends TenantFindUniqueArgs>(args: SelectSubset<T, TenantFindUniqueArgs<ExtArgs>>): Prisma__TenantClient<$Result.GetResult<Prisma.$TenantPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Tenant that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {TenantFindUniqueOrThrowArgs} args - Arguments to find a Tenant
     * @example
     * // Get one Tenant
     * const tenant = await prisma.tenant.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends TenantFindUniqueOrThrowArgs>(args: SelectSubset<T, TenantFindUniqueOrThrowArgs<ExtArgs>>): Prisma__TenantClient<$Result.GetResult<Prisma.$TenantPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Tenant that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TenantFindFirstArgs} args - Arguments to find a Tenant
     * @example
     * // Get one Tenant
     * const tenant = await prisma.tenant.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends TenantFindFirstArgs>(args?: SelectSubset<T, TenantFindFirstArgs<ExtArgs>>): Prisma__TenantClient<$Result.GetResult<Prisma.$TenantPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Tenant that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TenantFindFirstOrThrowArgs} args - Arguments to find a Tenant
     * @example
     * // Get one Tenant
     * const tenant = await prisma.tenant.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends TenantFindFirstOrThrowArgs>(args?: SelectSubset<T, TenantFindFirstOrThrowArgs<ExtArgs>>): Prisma__TenantClient<$Result.GetResult<Prisma.$TenantPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Tenants that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TenantFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Tenants
     * const tenants = await prisma.tenant.findMany()
     * 
     * // Get first 10 Tenants
     * const tenants = await prisma.tenant.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const tenantWithIdOnly = await prisma.tenant.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends TenantFindManyArgs>(args?: SelectSubset<T, TenantFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TenantPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Tenant.
     * @param {TenantCreateArgs} args - Arguments to create a Tenant.
     * @example
     * // Create one Tenant
     * const Tenant = await prisma.tenant.create({
     *   data: {
     *     // ... data to create a Tenant
     *   }
     * })
     * 
     */
    create<T extends TenantCreateArgs>(args: SelectSubset<T, TenantCreateArgs<ExtArgs>>): Prisma__TenantClient<$Result.GetResult<Prisma.$TenantPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Tenants.
     * @param {TenantCreateManyArgs} args - Arguments to create many Tenants.
     * @example
     * // Create many Tenants
     * const tenant = await prisma.tenant.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends TenantCreateManyArgs>(args?: SelectSubset<T, TenantCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Delete a Tenant.
     * @param {TenantDeleteArgs} args - Arguments to delete one Tenant.
     * @example
     * // Delete one Tenant
     * const Tenant = await prisma.tenant.delete({
     *   where: {
     *     // ... filter to delete one Tenant
     *   }
     * })
     * 
     */
    delete<T extends TenantDeleteArgs>(args: SelectSubset<T, TenantDeleteArgs<ExtArgs>>): Prisma__TenantClient<$Result.GetResult<Prisma.$TenantPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Tenant.
     * @param {TenantUpdateArgs} args - Arguments to update one Tenant.
     * @example
     * // Update one Tenant
     * const tenant = await prisma.tenant.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends TenantUpdateArgs>(args: SelectSubset<T, TenantUpdateArgs<ExtArgs>>): Prisma__TenantClient<$Result.GetResult<Prisma.$TenantPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Tenants.
     * @param {TenantDeleteManyArgs} args - Arguments to filter Tenants to delete.
     * @example
     * // Delete a few Tenants
     * const { count } = await prisma.tenant.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends TenantDeleteManyArgs>(args?: SelectSubset<T, TenantDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Tenants.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TenantUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Tenants
     * const tenant = await prisma.tenant.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends TenantUpdateManyArgs>(args: SelectSubset<T, TenantUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one Tenant.
     * @param {TenantUpsertArgs} args - Arguments to update or create a Tenant.
     * @example
     * // Update or create a Tenant
     * const tenant = await prisma.tenant.upsert({
     *   create: {
     *     // ... data to create a Tenant
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Tenant we want to update
     *   }
     * })
     */
    upsert<T extends TenantUpsertArgs>(args: SelectSubset<T, TenantUpsertArgs<ExtArgs>>): Prisma__TenantClient<$Result.GetResult<Prisma.$TenantPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Tenants.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TenantCountArgs} args - Arguments to filter Tenants to count.
     * @example
     * // Count the number of Tenants
     * const count = await prisma.tenant.count({
     *   where: {
     *     // ... the filter for the Tenants we want to count
     *   }
     * })
    **/
    count<T extends TenantCountArgs>(
      args?: Subset<T, TenantCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], TenantCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Tenant.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TenantAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends TenantAggregateArgs>(args: Subset<T, TenantAggregateArgs>): Prisma.PrismaPromise<GetTenantAggregateType<T>>

    /**
     * Group by Tenant.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TenantGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends TenantGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: TenantGroupByArgs['orderBy'] }
        : { orderBy?: TenantGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, TenantGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetTenantGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Tenant model
   */
  readonly fields: TenantFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Tenant.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__TenantClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    users<T extends Tenant$usersArgs<ExtArgs> = {}>(args?: Subset<T, Tenant$usersArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    tenantIntegrations<T extends Tenant$tenantIntegrationsArgs<ExtArgs> = {}>(args?: Subset<T, Tenant$tenantIntegrationsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TenantIntegrationPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Tenant model
   */
  interface TenantFieldRefs {
    readonly id: FieldRef<"Tenant", 'String'>
    readonly databaseName: FieldRef<"Tenant", 'String'>
    readonly databaseUrl: FieldRef<"Tenant", 'String'>
    readonly name: FieldRef<"Tenant", 'String'>
    readonly status: FieldRef<"Tenant", 'String'>
    readonly logoUrl: FieldRef<"Tenant", 'String'>
    readonly modulos: FieldRef<"Tenant", 'Json'>
    readonly razaoSocial: FieldRef<"Tenant", 'String'>
    readonly nomeFantasia: FieldRef<"Tenant", 'String'>
    readonly cnpj: FieldRef<"Tenant", 'String'>
    readonly ie: FieldRef<"Tenant", 'String'>
    readonly im: FieldRef<"Tenant", 'String'>
    readonly crt: FieldRef<"Tenant", 'Int'>
    readonly logradouro: FieldRef<"Tenant", 'String'>
    readonly numero: FieldRef<"Tenant", 'String'>
    readonly complemento: FieldRef<"Tenant", 'String'>
    readonly bairro: FieldRef<"Tenant", 'String'>
    readonly municipio: FieldRef<"Tenant", 'String'>
    readonly codMunicipio: FieldRef<"Tenant", 'String'>
    readonly uf: FieldRef<"Tenant", 'String'>
    readonly cep: FieldRef<"Tenant", 'String'>
    readonly telefone: FieldRef<"Tenant", 'String'>
    readonly emailContador: FieldRef<"Tenant", 'String'>
    readonly nfceAtivo: FieldRef<"Tenant", 'Boolean'>
    readonly nfceAutoSync: FieldRef<"Tenant", 'Boolean'>
    readonly nfceSerie: FieldRef<"Tenant", 'Int'>
    readonly nfceAmbiente: FieldRef<"Tenant", 'Int'>
    readonly nfceCsc: FieldRef<"Tenant", 'String'>
    readonly nfceIdCsc: FieldRef<"Tenant", 'String'>
    readonly certPfx: FieldRef<"Tenant", 'Bytes'>
    readonly certSenha: FieldRef<"Tenant", 'String'>
    readonly certValidade: FieldRef<"Tenant", 'DateTime'>
    readonly cosmosApiKey: FieldRef<"Tenant", 'String'>
    readonly mensalidadeValor: FieldRef<"Tenant", 'Decimal'>
    readonly mensalidadeVencimento: FieldRef<"Tenant", 'DateTime'>
    readonly createdAt: FieldRef<"Tenant", 'DateTime'>
    readonly updatedAt: FieldRef<"Tenant", 'DateTime'>
    readonly termsAcceptedAt: FieldRef<"Tenant", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Tenant findUnique
   */
  export type TenantFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Tenant
     */
    select?: TenantSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Tenant
     */
    omit?: TenantOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TenantInclude<ExtArgs> | null
    /**
     * Filter, which Tenant to fetch.
     */
    where: TenantWhereUniqueInput
  }

  /**
   * Tenant findUniqueOrThrow
   */
  export type TenantFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Tenant
     */
    select?: TenantSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Tenant
     */
    omit?: TenantOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TenantInclude<ExtArgs> | null
    /**
     * Filter, which Tenant to fetch.
     */
    where: TenantWhereUniqueInput
  }

  /**
   * Tenant findFirst
   */
  export type TenantFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Tenant
     */
    select?: TenantSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Tenant
     */
    omit?: TenantOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TenantInclude<ExtArgs> | null
    /**
     * Filter, which Tenant to fetch.
     */
    where?: TenantWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Tenants to fetch.
     */
    orderBy?: TenantOrderByWithRelationInput | TenantOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Tenants.
     */
    cursor?: TenantWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Tenants from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Tenants.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Tenants.
     */
    distinct?: TenantScalarFieldEnum | TenantScalarFieldEnum[]
  }

  /**
   * Tenant findFirstOrThrow
   */
  export type TenantFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Tenant
     */
    select?: TenantSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Tenant
     */
    omit?: TenantOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TenantInclude<ExtArgs> | null
    /**
     * Filter, which Tenant to fetch.
     */
    where?: TenantWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Tenants to fetch.
     */
    orderBy?: TenantOrderByWithRelationInput | TenantOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Tenants.
     */
    cursor?: TenantWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Tenants from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Tenants.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Tenants.
     */
    distinct?: TenantScalarFieldEnum | TenantScalarFieldEnum[]
  }

  /**
   * Tenant findMany
   */
  export type TenantFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Tenant
     */
    select?: TenantSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Tenant
     */
    omit?: TenantOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TenantInclude<ExtArgs> | null
    /**
     * Filter, which Tenants to fetch.
     */
    where?: TenantWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Tenants to fetch.
     */
    orderBy?: TenantOrderByWithRelationInput | TenantOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Tenants.
     */
    cursor?: TenantWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Tenants from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Tenants.
     */
    skip?: number
    distinct?: TenantScalarFieldEnum | TenantScalarFieldEnum[]
  }

  /**
   * Tenant create
   */
  export type TenantCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Tenant
     */
    select?: TenantSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Tenant
     */
    omit?: TenantOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TenantInclude<ExtArgs> | null
    /**
     * The data needed to create a Tenant.
     */
    data: XOR<TenantCreateInput, TenantUncheckedCreateInput>
  }

  /**
   * Tenant createMany
   */
  export type TenantCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Tenants.
     */
    data: TenantCreateManyInput | TenantCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Tenant update
   */
  export type TenantUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Tenant
     */
    select?: TenantSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Tenant
     */
    omit?: TenantOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TenantInclude<ExtArgs> | null
    /**
     * The data needed to update a Tenant.
     */
    data: XOR<TenantUpdateInput, TenantUncheckedUpdateInput>
    /**
     * Choose, which Tenant to update.
     */
    where: TenantWhereUniqueInput
  }

  /**
   * Tenant updateMany
   */
  export type TenantUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Tenants.
     */
    data: XOR<TenantUpdateManyMutationInput, TenantUncheckedUpdateManyInput>
    /**
     * Filter which Tenants to update
     */
    where?: TenantWhereInput
    /**
     * Limit how many Tenants to update.
     */
    limit?: number
  }

  /**
   * Tenant upsert
   */
  export type TenantUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Tenant
     */
    select?: TenantSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Tenant
     */
    omit?: TenantOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TenantInclude<ExtArgs> | null
    /**
     * The filter to search for the Tenant to update in case it exists.
     */
    where: TenantWhereUniqueInput
    /**
     * In case the Tenant found by the `where` argument doesn't exist, create a new Tenant with this data.
     */
    create: XOR<TenantCreateInput, TenantUncheckedCreateInput>
    /**
     * In case the Tenant was found with the provided `where` argument, update it with this data.
     */
    update: XOR<TenantUpdateInput, TenantUncheckedUpdateInput>
  }

  /**
   * Tenant delete
   */
  export type TenantDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Tenant
     */
    select?: TenantSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Tenant
     */
    omit?: TenantOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TenantInclude<ExtArgs> | null
    /**
     * Filter which Tenant to delete.
     */
    where: TenantWhereUniqueInput
  }

  /**
   * Tenant deleteMany
   */
  export type TenantDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Tenants to delete
     */
    where?: TenantWhereInput
    /**
     * Limit how many Tenants to delete.
     */
    limit?: number
  }

  /**
   * Tenant.users
   */
  export type Tenant$usersArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    where?: UserWhereInput
    orderBy?: UserOrderByWithRelationInput | UserOrderByWithRelationInput[]
    cursor?: UserWhereUniqueInput
    take?: number
    skip?: number
    distinct?: UserScalarFieldEnum | UserScalarFieldEnum[]
  }

  /**
   * Tenant.tenantIntegrations
   */
  export type Tenant$tenantIntegrationsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TenantIntegration
     */
    select?: TenantIntegrationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TenantIntegration
     */
    omit?: TenantIntegrationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TenantIntegrationInclude<ExtArgs> | null
    where?: TenantIntegrationWhereInput
    orderBy?: TenantIntegrationOrderByWithRelationInput | TenantIntegrationOrderByWithRelationInput[]
    cursor?: TenantIntegrationWhereUniqueInput
    take?: number
    skip?: number
    distinct?: TenantIntegrationScalarFieldEnum | TenantIntegrationScalarFieldEnum[]
  }

  /**
   * Tenant without action
   */
  export type TenantDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Tenant
     */
    select?: TenantSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Tenant
     */
    omit?: TenantOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TenantInclude<ExtArgs> | null
  }


  /**
   * Model User
   */

  export type AggregateUser = {
    _count: UserCountAggregateOutputType | null
    _min: UserMinAggregateOutputType | null
    _max: UserMaxAggregateOutputType | null
  }

  export type UserMinAggregateOutputType = {
    id: string | null
    tenantId: string | null
    name: string | null
    email: string | null
    password: string | null
    role: string | null
    pin: string | null
    active: boolean | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type UserMaxAggregateOutputType = {
    id: string | null
    tenantId: string | null
    name: string | null
    email: string | null
    password: string | null
    role: string | null
    pin: string | null
    active: boolean | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type UserCountAggregateOutputType = {
    id: number
    tenantId: number
    name: number
    email: number
    password: number
    role: number
    pin: number
    active: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type UserMinAggregateInputType = {
    id?: true
    tenantId?: true
    name?: true
    email?: true
    password?: true
    role?: true
    pin?: true
    active?: true
    createdAt?: true
    updatedAt?: true
  }

  export type UserMaxAggregateInputType = {
    id?: true
    tenantId?: true
    name?: true
    email?: true
    password?: true
    role?: true
    pin?: true
    active?: true
    createdAt?: true
    updatedAt?: true
  }

  export type UserCountAggregateInputType = {
    id?: true
    tenantId?: true
    name?: true
    email?: true
    password?: true
    role?: true
    pin?: true
    active?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type UserAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which User to aggregate.
     */
    where?: UserWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Users to fetch.
     */
    orderBy?: UserOrderByWithRelationInput | UserOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: UserWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Users from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Users.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Users
    **/
    _count?: true | UserCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: UserMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: UserMaxAggregateInputType
  }

  export type GetUserAggregateType<T extends UserAggregateArgs> = {
        [P in keyof T & keyof AggregateUser]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateUser[P]>
      : GetScalarType<T[P], AggregateUser[P]>
  }




  export type UserGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: UserWhereInput
    orderBy?: UserOrderByWithAggregationInput | UserOrderByWithAggregationInput[]
    by: UserScalarFieldEnum[] | UserScalarFieldEnum
    having?: UserScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: UserCountAggregateInputType | true
    _min?: UserMinAggregateInputType
    _max?: UserMaxAggregateInputType
  }

  export type UserGroupByOutputType = {
    id: string
    tenantId: string
    name: string
    email: string
    password: string
    role: string
    pin: string | null
    active: boolean
    createdAt: Date
    updatedAt: Date
    _count: UserCountAggregateOutputType | null
    _min: UserMinAggregateOutputType | null
    _max: UserMaxAggregateOutputType | null
  }

  type GetUserGroupByPayload<T extends UserGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<UserGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof UserGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], UserGroupByOutputType[P]>
            : GetScalarType<T[P], UserGroupByOutputType[P]>
        }
      >
    >


  export type UserSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    tenantId?: boolean
    name?: boolean
    email?: boolean
    password?: boolean
    role?: boolean
    pin?: boolean
    active?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["user"]>



  export type UserSelectScalar = {
    id?: boolean
    tenantId?: boolean
    name?: boolean
    email?: boolean
    password?: boolean
    role?: boolean
    pin?: boolean
    active?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type UserOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "tenantId" | "name" | "email" | "password" | "role" | "pin" | "active" | "createdAt" | "updatedAt", ExtArgs["result"]["user"]>
  export type UserInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
  }

  export type $UserPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "User"
    objects: {
      tenant: Prisma.$TenantPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      tenantId: string
      name: string
      email: string
      password: string
      role: string
      pin: string | null
      active: boolean
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["user"]>
    composites: {}
  }

  type UserGetPayload<S extends boolean | null | undefined | UserDefaultArgs> = $Result.GetResult<Prisma.$UserPayload, S>

  type UserCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<UserFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: UserCountAggregateInputType | true
    }

  export interface UserDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['User'], meta: { name: 'User' } }
    /**
     * Find zero or one User that matches the filter.
     * @param {UserFindUniqueArgs} args - Arguments to find a User
     * @example
     * // Get one User
     * const user = await prisma.user.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends UserFindUniqueArgs>(args: SelectSubset<T, UserFindUniqueArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one User that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {UserFindUniqueOrThrowArgs} args - Arguments to find a User
     * @example
     * // Get one User
     * const user = await prisma.user.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends UserFindUniqueOrThrowArgs>(args: SelectSubset<T, UserFindUniqueOrThrowArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first User that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserFindFirstArgs} args - Arguments to find a User
     * @example
     * // Get one User
     * const user = await prisma.user.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends UserFindFirstArgs>(args?: SelectSubset<T, UserFindFirstArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first User that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserFindFirstOrThrowArgs} args - Arguments to find a User
     * @example
     * // Get one User
     * const user = await prisma.user.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends UserFindFirstOrThrowArgs>(args?: SelectSubset<T, UserFindFirstOrThrowArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Users that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Users
     * const users = await prisma.user.findMany()
     * 
     * // Get first 10 Users
     * const users = await prisma.user.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const userWithIdOnly = await prisma.user.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends UserFindManyArgs>(args?: SelectSubset<T, UserFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a User.
     * @param {UserCreateArgs} args - Arguments to create a User.
     * @example
     * // Create one User
     * const User = await prisma.user.create({
     *   data: {
     *     // ... data to create a User
     *   }
     * })
     * 
     */
    create<T extends UserCreateArgs>(args: SelectSubset<T, UserCreateArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Users.
     * @param {UserCreateManyArgs} args - Arguments to create many Users.
     * @example
     * // Create many Users
     * const user = await prisma.user.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends UserCreateManyArgs>(args?: SelectSubset<T, UserCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Delete a User.
     * @param {UserDeleteArgs} args - Arguments to delete one User.
     * @example
     * // Delete one User
     * const User = await prisma.user.delete({
     *   where: {
     *     // ... filter to delete one User
     *   }
     * })
     * 
     */
    delete<T extends UserDeleteArgs>(args: SelectSubset<T, UserDeleteArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one User.
     * @param {UserUpdateArgs} args - Arguments to update one User.
     * @example
     * // Update one User
     * const user = await prisma.user.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends UserUpdateArgs>(args: SelectSubset<T, UserUpdateArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Users.
     * @param {UserDeleteManyArgs} args - Arguments to filter Users to delete.
     * @example
     * // Delete a few Users
     * const { count } = await prisma.user.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends UserDeleteManyArgs>(args?: SelectSubset<T, UserDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Users.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Users
     * const user = await prisma.user.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends UserUpdateManyArgs>(args: SelectSubset<T, UserUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one User.
     * @param {UserUpsertArgs} args - Arguments to update or create a User.
     * @example
     * // Update or create a User
     * const user = await prisma.user.upsert({
     *   create: {
     *     // ... data to create a User
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the User we want to update
     *   }
     * })
     */
    upsert<T extends UserUpsertArgs>(args: SelectSubset<T, UserUpsertArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Users.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserCountArgs} args - Arguments to filter Users to count.
     * @example
     * // Count the number of Users
     * const count = await prisma.user.count({
     *   where: {
     *     // ... the filter for the Users we want to count
     *   }
     * })
    **/
    count<T extends UserCountArgs>(
      args?: Subset<T, UserCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], UserCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a User.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends UserAggregateArgs>(args: Subset<T, UserAggregateArgs>): Prisma.PrismaPromise<GetUserAggregateType<T>>

    /**
     * Group by User.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends UserGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: UserGroupByArgs['orderBy'] }
        : { orderBy?: UserGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, UserGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetUserGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the User model
   */
  readonly fields: UserFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for User.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__UserClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    tenant<T extends TenantDefaultArgs<ExtArgs> = {}>(args?: Subset<T, TenantDefaultArgs<ExtArgs>>): Prisma__TenantClient<$Result.GetResult<Prisma.$TenantPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the User model
   */
  interface UserFieldRefs {
    readonly id: FieldRef<"User", 'String'>
    readonly tenantId: FieldRef<"User", 'String'>
    readonly name: FieldRef<"User", 'String'>
    readonly email: FieldRef<"User", 'String'>
    readonly password: FieldRef<"User", 'String'>
    readonly role: FieldRef<"User", 'String'>
    readonly pin: FieldRef<"User", 'String'>
    readonly active: FieldRef<"User", 'Boolean'>
    readonly createdAt: FieldRef<"User", 'DateTime'>
    readonly updatedAt: FieldRef<"User", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * User findUnique
   */
  export type UserFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * Filter, which User to fetch.
     */
    where: UserWhereUniqueInput
  }

  /**
   * User findUniqueOrThrow
   */
  export type UserFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * Filter, which User to fetch.
     */
    where: UserWhereUniqueInput
  }

  /**
   * User findFirst
   */
  export type UserFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * Filter, which User to fetch.
     */
    where?: UserWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Users to fetch.
     */
    orderBy?: UserOrderByWithRelationInput | UserOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Users.
     */
    cursor?: UserWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Users from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Users.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Users.
     */
    distinct?: UserScalarFieldEnum | UserScalarFieldEnum[]
  }

  /**
   * User findFirstOrThrow
   */
  export type UserFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * Filter, which User to fetch.
     */
    where?: UserWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Users to fetch.
     */
    orderBy?: UserOrderByWithRelationInput | UserOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Users.
     */
    cursor?: UserWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Users from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Users.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Users.
     */
    distinct?: UserScalarFieldEnum | UserScalarFieldEnum[]
  }

  /**
   * User findMany
   */
  export type UserFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * Filter, which Users to fetch.
     */
    where?: UserWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Users to fetch.
     */
    orderBy?: UserOrderByWithRelationInput | UserOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Users.
     */
    cursor?: UserWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Users from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Users.
     */
    skip?: number
    distinct?: UserScalarFieldEnum | UserScalarFieldEnum[]
  }

  /**
   * User create
   */
  export type UserCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * The data needed to create a User.
     */
    data: XOR<UserCreateInput, UserUncheckedCreateInput>
  }

  /**
   * User createMany
   */
  export type UserCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Users.
     */
    data: UserCreateManyInput | UserCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * User update
   */
  export type UserUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * The data needed to update a User.
     */
    data: XOR<UserUpdateInput, UserUncheckedUpdateInput>
    /**
     * Choose, which User to update.
     */
    where: UserWhereUniqueInput
  }

  /**
   * User updateMany
   */
  export type UserUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Users.
     */
    data: XOR<UserUpdateManyMutationInput, UserUncheckedUpdateManyInput>
    /**
     * Filter which Users to update
     */
    where?: UserWhereInput
    /**
     * Limit how many Users to update.
     */
    limit?: number
  }

  /**
   * User upsert
   */
  export type UserUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * The filter to search for the User to update in case it exists.
     */
    where: UserWhereUniqueInput
    /**
     * In case the User found by the `where` argument doesn't exist, create a new User with this data.
     */
    create: XOR<UserCreateInput, UserUncheckedCreateInput>
    /**
     * In case the User was found with the provided `where` argument, update it with this data.
     */
    update: XOR<UserUpdateInput, UserUncheckedUpdateInput>
  }

  /**
   * User delete
   */
  export type UserDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * Filter which User to delete.
     */
    where: UserWhereUniqueInput
  }

  /**
   * User deleteMany
   */
  export type UserDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Users to delete
     */
    where?: UserWhereInput
    /**
     * Limit how many Users to delete.
     */
    limit?: number
  }

  /**
   * User without action
   */
  export type UserDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
  }


  /**
   * Model MasterProduct
   */

  export type AggregateMasterProduct = {
    _count: MasterProductCountAggregateOutputType | null
    _min: MasterProductMinAggregateOutputType | null
    _max: MasterProductMaxAggregateOutputType | null
  }

  export type MasterProductMinAggregateOutputType = {
    id: string | null
    ean: string | null
    name: string | null
    brand: string | null
    ncm: string | null
    cest: string | null
    unit: string | null
    imageUrl: string | null
    category: string | null
    source: string | null
    createdAt: Date | null
  }

  export type MasterProductMaxAggregateOutputType = {
    id: string | null
    ean: string | null
    name: string | null
    brand: string | null
    ncm: string | null
    cest: string | null
    unit: string | null
    imageUrl: string | null
    category: string | null
    source: string | null
    createdAt: Date | null
  }

  export type MasterProductCountAggregateOutputType = {
    id: number
    ean: number
    name: number
    brand: number
    ncm: number
    cest: number
    unit: number
    imageUrl: number
    category: number
    source: number
    createdAt: number
    _all: number
  }


  export type MasterProductMinAggregateInputType = {
    id?: true
    ean?: true
    name?: true
    brand?: true
    ncm?: true
    cest?: true
    unit?: true
    imageUrl?: true
    category?: true
    source?: true
    createdAt?: true
  }

  export type MasterProductMaxAggregateInputType = {
    id?: true
    ean?: true
    name?: true
    brand?: true
    ncm?: true
    cest?: true
    unit?: true
    imageUrl?: true
    category?: true
    source?: true
    createdAt?: true
  }

  export type MasterProductCountAggregateInputType = {
    id?: true
    ean?: true
    name?: true
    brand?: true
    ncm?: true
    cest?: true
    unit?: true
    imageUrl?: true
    category?: true
    source?: true
    createdAt?: true
    _all?: true
  }

  export type MasterProductAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which MasterProduct to aggregate.
     */
    where?: MasterProductWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of MasterProducts to fetch.
     */
    orderBy?: MasterProductOrderByWithRelationInput | MasterProductOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: MasterProductWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` MasterProducts from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` MasterProducts.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned MasterProducts
    **/
    _count?: true | MasterProductCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: MasterProductMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: MasterProductMaxAggregateInputType
  }

  export type GetMasterProductAggregateType<T extends MasterProductAggregateArgs> = {
        [P in keyof T & keyof AggregateMasterProduct]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateMasterProduct[P]>
      : GetScalarType<T[P], AggregateMasterProduct[P]>
  }




  export type MasterProductGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: MasterProductWhereInput
    orderBy?: MasterProductOrderByWithAggregationInput | MasterProductOrderByWithAggregationInput[]
    by: MasterProductScalarFieldEnum[] | MasterProductScalarFieldEnum
    having?: MasterProductScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: MasterProductCountAggregateInputType | true
    _min?: MasterProductMinAggregateInputType
    _max?: MasterProductMaxAggregateInputType
  }

  export type MasterProductGroupByOutputType = {
    id: string
    ean: string
    name: string
    brand: string | null
    ncm: string | null
    cest: string | null
    unit: string
    imageUrl: string | null
    category: string | null
    source: string
    createdAt: Date
    _count: MasterProductCountAggregateOutputType | null
    _min: MasterProductMinAggregateOutputType | null
    _max: MasterProductMaxAggregateOutputType | null
  }

  type GetMasterProductGroupByPayload<T extends MasterProductGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<MasterProductGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof MasterProductGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], MasterProductGroupByOutputType[P]>
            : GetScalarType<T[P], MasterProductGroupByOutputType[P]>
        }
      >
    >


  export type MasterProductSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    ean?: boolean
    name?: boolean
    brand?: boolean
    ncm?: boolean
    cest?: boolean
    unit?: boolean
    imageUrl?: boolean
    category?: boolean
    source?: boolean
    createdAt?: boolean
  }, ExtArgs["result"]["masterProduct"]>



  export type MasterProductSelectScalar = {
    id?: boolean
    ean?: boolean
    name?: boolean
    brand?: boolean
    ncm?: boolean
    cest?: boolean
    unit?: boolean
    imageUrl?: boolean
    category?: boolean
    source?: boolean
    createdAt?: boolean
  }

  export type MasterProductOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "ean" | "name" | "brand" | "ncm" | "cest" | "unit" | "imageUrl" | "category" | "source" | "createdAt", ExtArgs["result"]["masterProduct"]>

  export type $MasterProductPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "MasterProduct"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: string
      ean: string
      name: string
      brand: string | null
      ncm: string | null
      cest: string | null
      unit: string
      imageUrl: string | null
      category: string | null
      source: string
      createdAt: Date
    }, ExtArgs["result"]["masterProduct"]>
    composites: {}
  }

  type MasterProductGetPayload<S extends boolean | null | undefined | MasterProductDefaultArgs> = $Result.GetResult<Prisma.$MasterProductPayload, S>

  type MasterProductCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<MasterProductFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: MasterProductCountAggregateInputType | true
    }

  export interface MasterProductDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['MasterProduct'], meta: { name: 'MasterProduct' } }
    /**
     * Find zero or one MasterProduct that matches the filter.
     * @param {MasterProductFindUniqueArgs} args - Arguments to find a MasterProduct
     * @example
     * // Get one MasterProduct
     * const masterProduct = await prisma.masterProduct.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends MasterProductFindUniqueArgs>(args: SelectSubset<T, MasterProductFindUniqueArgs<ExtArgs>>): Prisma__MasterProductClient<$Result.GetResult<Prisma.$MasterProductPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one MasterProduct that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {MasterProductFindUniqueOrThrowArgs} args - Arguments to find a MasterProduct
     * @example
     * // Get one MasterProduct
     * const masterProduct = await prisma.masterProduct.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends MasterProductFindUniqueOrThrowArgs>(args: SelectSubset<T, MasterProductFindUniqueOrThrowArgs<ExtArgs>>): Prisma__MasterProductClient<$Result.GetResult<Prisma.$MasterProductPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first MasterProduct that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {MasterProductFindFirstArgs} args - Arguments to find a MasterProduct
     * @example
     * // Get one MasterProduct
     * const masterProduct = await prisma.masterProduct.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends MasterProductFindFirstArgs>(args?: SelectSubset<T, MasterProductFindFirstArgs<ExtArgs>>): Prisma__MasterProductClient<$Result.GetResult<Prisma.$MasterProductPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first MasterProduct that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {MasterProductFindFirstOrThrowArgs} args - Arguments to find a MasterProduct
     * @example
     * // Get one MasterProduct
     * const masterProduct = await prisma.masterProduct.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends MasterProductFindFirstOrThrowArgs>(args?: SelectSubset<T, MasterProductFindFirstOrThrowArgs<ExtArgs>>): Prisma__MasterProductClient<$Result.GetResult<Prisma.$MasterProductPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more MasterProducts that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {MasterProductFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all MasterProducts
     * const masterProducts = await prisma.masterProduct.findMany()
     * 
     * // Get first 10 MasterProducts
     * const masterProducts = await prisma.masterProduct.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const masterProductWithIdOnly = await prisma.masterProduct.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends MasterProductFindManyArgs>(args?: SelectSubset<T, MasterProductFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$MasterProductPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a MasterProduct.
     * @param {MasterProductCreateArgs} args - Arguments to create a MasterProduct.
     * @example
     * // Create one MasterProduct
     * const MasterProduct = await prisma.masterProduct.create({
     *   data: {
     *     // ... data to create a MasterProduct
     *   }
     * })
     * 
     */
    create<T extends MasterProductCreateArgs>(args: SelectSubset<T, MasterProductCreateArgs<ExtArgs>>): Prisma__MasterProductClient<$Result.GetResult<Prisma.$MasterProductPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many MasterProducts.
     * @param {MasterProductCreateManyArgs} args - Arguments to create many MasterProducts.
     * @example
     * // Create many MasterProducts
     * const masterProduct = await prisma.masterProduct.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends MasterProductCreateManyArgs>(args?: SelectSubset<T, MasterProductCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Delete a MasterProduct.
     * @param {MasterProductDeleteArgs} args - Arguments to delete one MasterProduct.
     * @example
     * // Delete one MasterProduct
     * const MasterProduct = await prisma.masterProduct.delete({
     *   where: {
     *     // ... filter to delete one MasterProduct
     *   }
     * })
     * 
     */
    delete<T extends MasterProductDeleteArgs>(args: SelectSubset<T, MasterProductDeleteArgs<ExtArgs>>): Prisma__MasterProductClient<$Result.GetResult<Prisma.$MasterProductPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one MasterProduct.
     * @param {MasterProductUpdateArgs} args - Arguments to update one MasterProduct.
     * @example
     * // Update one MasterProduct
     * const masterProduct = await prisma.masterProduct.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends MasterProductUpdateArgs>(args: SelectSubset<T, MasterProductUpdateArgs<ExtArgs>>): Prisma__MasterProductClient<$Result.GetResult<Prisma.$MasterProductPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more MasterProducts.
     * @param {MasterProductDeleteManyArgs} args - Arguments to filter MasterProducts to delete.
     * @example
     * // Delete a few MasterProducts
     * const { count } = await prisma.masterProduct.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends MasterProductDeleteManyArgs>(args?: SelectSubset<T, MasterProductDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more MasterProducts.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {MasterProductUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many MasterProducts
     * const masterProduct = await prisma.masterProduct.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends MasterProductUpdateManyArgs>(args: SelectSubset<T, MasterProductUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one MasterProduct.
     * @param {MasterProductUpsertArgs} args - Arguments to update or create a MasterProduct.
     * @example
     * // Update or create a MasterProduct
     * const masterProduct = await prisma.masterProduct.upsert({
     *   create: {
     *     // ... data to create a MasterProduct
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the MasterProduct we want to update
     *   }
     * })
     */
    upsert<T extends MasterProductUpsertArgs>(args: SelectSubset<T, MasterProductUpsertArgs<ExtArgs>>): Prisma__MasterProductClient<$Result.GetResult<Prisma.$MasterProductPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of MasterProducts.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {MasterProductCountArgs} args - Arguments to filter MasterProducts to count.
     * @example
     * // Count the number of MasterProducts
     * const count = await prisma.masterProduct.count({
     *   where: {
     *     // ... the filter for the MasterProducts we want to count
     *   }
     * })
    **/
    count<T extends MasterProductCountArgs>(
      args?: Subset<T, MasterProductCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], MasterProductCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a MasterProduct.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {MasterProductAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends MasterProductAggregateArgs>(args: Subset<T, MasterProductAggregateArgs>): Prisma.PrismaPromise<GetMasterProductAggregateType<T>>

    /**
     * Group by MasterProduct.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {MasterProductGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends MasterProductGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: MasterProductGroupByArgs['orderBy'] }
        : { orderBy?: MasterProductGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, MasterProductGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetMasterProductGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the MasterProduct model
   */
  readonly fields: MasterProductFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for MasterProduct.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__MasterProductClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the MasterProduct model
   */
  interface MasterProductFieldRefs {
    readonly id: FieldRef<"MasterProduct", 'String'>
    readonly ean: FieldRef<"MasterProduct", 'String'>
    readonly name: FieldRef<"MasterProduct", 'String'>
    readonly brand: FieldRef<"MasterProduct", 'String'>
    readonly ncm: FieldRef<"MasterProduct", 'String'>
    readonly cest: FieldRef<"MasterProduct", 'String'>
    readonly unit: FieldRef<"MasterProduct", 'String'>
    readonly imageUrl: FieldRef<"MasterProduct", 'String'>
    readonly category: FieldRef<"MasterProduct", 'String'>
    readonly source: FieldRef<"MasterProduct", 'String'>
    readonly createdAt: FieldRef<"MasterProduct", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * MasterProduct findUnique
   */
  export type MasterProductFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MasterProduct
     */
    select?: MasterProductSelect<ExtArgs> | null
    /**
     * Omit specific fields from the MasterProduct
     */
    omit?: MasterProductOmit<ExtArgs> | null
    /**
     * Filter, which MasterProduct to fetch.
     */
    where: MasterProductWhereUniqueInput
  }

  /**
   * MasterProduct findUniqueOrThrow
   */
  export type MasterProductFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MasterProduct
     */
    select?: MasterProductSelect<ExtArgs> | null
    /**
     * Omit specific fields from the MasterProduct
     */
    omit?: MasterProductOmit<ExtArgs> | null
    /**
     * Filter, which MasterProduct to fetch.
     */
    where: MasterProductWhereUniqueInput
  }

  /**
   * MasterProduct findFirst
   */
  export type MasterProductFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MasterProduct
     */
    select?: MasterProductSelect<ExtArgs> | null
    /**
     * Omit specific fields from the MasterProduct
     */
    omit?: MasterProductOmit<ExtArgs> | null
    /**
     * Filter, which MasterProduct to fetch.
     */
    where?: MasterProductWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of MasterProducts to fetch.
     */
    orderBy?: MasterProductOrderByWithRelationInput | MasterProductOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for MasterProducts.
     */
    cursor?: MasterProductWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` MasterProducts from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` MasterProducts.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of MasterProducts.
     */
    distinct?: MasterProductScalarFieldEnum | MasterProductScalarFieldEnum[]
  }

  /**
   * MasterProduct findFirstOrThrow
   */
  export type MasterProductFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MasterProduct
     */
    select?: MasterProductSelect<ExtArgs> | null
    /**
     * Omit specific fields from the MasterProduct
     */
    omit?: MasterProductOmit<ExtArgs> | null
    /**
     * Filter, which MasterProduct to fetch.
     */
    where?: MasterProductWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of MasterProducts to fetch.
     */
    orderBy?: MasterProductOrderByWithRelationInput | MasterProductOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for MasterProducts.
     */
    cursor?: MasterProductWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` MasterProducts from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` MasterProducts.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of MasterProducts.
     */
    distinct?: MasterProductScalarFieldEnum | MasterProductScalarFieldEnum[]
  }

  /**
   * MasterProduct findMany
   */
  export type MasterProductFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MasterProduct
     */
    select?: MasterProductSelect<ExtArgs> | null
    /**
     * Omit specific fields from the MasterProduct
     */
    omit?: MasterProductOmit<ExtArgs> | null
    /**
     * Filter, which MasterProducts to fetch.
     */
    where?: MasterProductWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of MasterProducts to fetch.
     */
    orderBy?: MasterProductOrderByWithRelationInput | MasterProductOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing MasterProducts.
     */
    cursor?: MasterProductWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` MasterProducts from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` MasterProducts.
     */
    skip?: number
    distinct?: MasterProductScalarFieldEnum | MasterProductScalarFieldEnum[]
  }

  /**
   * MasterProduct create
   */
  export type MasterProductCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MasterProduct
     */
    select?: MasterProductSelect<ExtArgs> | null
    /**
     * Omit specific fields from the MasterProduct
     */
    omit?: MasterProductOmit<ExtArgs> | null
    /**
     * The data needed to create a MasterProduct.
     */
    data: XOR<MasterProductCreateInput, MasterProductUncheckedCreateInput>
  }

  /**
   * MasterProduct createMany
   */
  export type MasterProductCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many MasterProducts.
     */
    data: MasterProductCreateManyInput | MasterProductCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * MasterProduct update
   */
  export type MasterProductUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MasterProduct
     */
    select?: MasterProductSelect<ExtArgs> | null
    /**
     * Omit specific fields from the MasterProduct
     */
    omit?: MasterProductOmit<ExtArgs> | null
    /**
     * The data needed to update a MasterProduct.
     */
    data: XOR<MasterProductUpdateInput, MasterProductUncheckedUpdateInput>
    /**
     * Choose, which MasterProduct to update.
     */
    where: MasterProductWhereUniqueInput
  }

  /**
   * MasterProduct updateMany
   */
  export type MasterProductUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update MasterProducts.
     */
    data: XOR<MasterProductUpdateManyMutationInput, MasterProductUncheckedUpdateManyInput>
    /**
     * Filter which MasterProducts to update
     */
    where?: MasterProductWhereInput
    /**
     * Limit how many MasterProducts to update.
     */
    limit?: number
  }

  /**
   * MasterProduct upsert
   */
  export type MasterProductUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MasterProduct
     */
    select?: MasterProductSelect<ExtArgs> | null
    /**
     * Omit specific fields from the MasterProduct
     */
    omit?: MasterProductOmit<ExtArgs> | null
    /**
     * The filter to search for the MasterProduct to update in case it exists.
     */
    where: MasterProductWhereUniqueInput
    /**
     * In case the MasterProduct found by the `where` argument doesn't exist, create a new MasterProduct with this data.
     */
    create: XOR<MasterProductCreateInput, MasterProductUncheckedCreateInput>
    /**
     * In case the MasterProduct was found with the provided `where` argument, update it with this data.
     */
    update: XOR<MasterProductUpdateInput, MasterProductUncheckedUpdateInput>
  }

  /**
   * MasterProduct delete
   */
  export type MasterProductDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MasterProduct
     */
    select?: MasterProductSelect<ExtArgs> | null
    /**
     * Omit specific fields from the MasterProduct
     */
    omit?: MasterProductOmit<ExtArgs> | null
    /**
     * Filter which MasterProduct to delete.
     */
    where: MasterProductWhereUniqueInput
  }

  /**
   * MasterProduct deleteMany
   */
  export type MasterProductDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which MasterProducts to delete
     */
    where?: MasterProductWhereInput
    /**
     * Limit how many MasterProducts to delete.
     */
    limit?: number
  }

  /**
   * MasterProduct without action
   */
  export type MasterProductDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the MasterProduct
     */
    select?: MasterProductSelect<ExtArgs> | null
    /**
     * Omit specific fields from the MasterProduct
     */
    omit?: MasterProductOmit<ExtArgs> | null
  }


  /**
   * Model Image
   */

  export type AggregateImage = {
    _count: ImageCountAggregateOutputType | null
    _min: ImageMinAggregateOutputType | null
    _max: ImageMaxAggregateOutputType | null
  }

  export type ImageMinAggregateOutputType = {
    id: string | null
    data: Bytes | null
    mimeType: string | null
    createdAt: Date | null
  }

  export type ImageMaxAggregateOutputType = {
    id: string | null
    data: Bytes | null
    mimeType: string | null
    createdAt: Date | null
  }

  export type ImageCountAggregateOutputType = {
    id: number
    data: number
    mimeType: number
    createdAt: number
    _all: number
  }


  export type ImageMinAggregateInputType = {
    id?: true
    data?: true
    mimeType?: true
    createdAt?: true
  }

  export type ImageMaxAggregateInputType = {
    id?: true
    data?: true
    mimeType?: true
    createdAt?: true
  }

  export type ImageCountAggregateInputType = {
    id?: true
    data?: true
    mimeType?: true
    createdAt?: true
    _all?: true
  }

  export type ImageAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Image to aggregate.
     */
    where?: ImageWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Images to fetch.
     */
    orderBy?: ImageOrderByWithRelationInput | ImageOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: ImageWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Images from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Images.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Images
    **/
    _count?: true | ImageCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: ImageMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: ImageMaxAggregateInputType
  }

  export type GetImageAggregateType<T extends ImageAggregateArgs> = {
        [P in keyof T & keyof AggregateImage]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateImage[P]>
      : GetScalarType<T[P], AggregateImage[P]>
  }




  export type ImageGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ImageWhereInput
    orderBy?: ImageOrderByWithAggregationInput | ImageOrderByWithAggregationInput[]
    by: ImageScalarFieldEnum[] | ImageScalarFieldEnum
    having?: ImageScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: ImageCountAggregateInputType | true
    _min?: ImageMinAggregateInputType
    _max?: ImageMaxAggregateInputType
  }

  export type ImageGroupByOutputType = {
    id: string
    data: Bytes
    mimeType: string
    createdAt: Date
    _count: ImageCountAggregateOutputType | null
    _min: ImageMinAggregateOutputType | null
    _max: ImageMaxAggregateOutputType | null
  }

  type GetImageGroupByPayload<T extends ImageGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<ImageGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof ImageGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], ImageGroupByOutputType[P]>
            : GetScalarType<T[P], ImageGroupByOutputType[P]>
        }
      >
    >


  export type ImageSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    data?: boolean
    mimeType?: boolean
    createdAt?: boolean
  }, ExtArgs["result"]["image"]>



  export type ImageSelectScalar = {
    id?: boolean
    data?: boolean
    mimeType?: boolean
    createdAt?: boolean
  }

  export type ImageOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "data" | "mimeType" | "createdAt", ExtArgs["result"]["image"]>

  export type $ImagePayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Image"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: string
      data: Prisma.Bytes
      mimeType: string
      createdAt: Date
    }, ExtArgs["result"]["image"]>
    composites: {}
  }

  type ImageGetPayload<S extends boolean | null | undefined | ImageDefaultArgs> = $Result.GetResult<Prisma.$ImagePayload, S>

  type ImageCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<ImageFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: ImageCountAggregateInputType | true
    }

  export interface ImageDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Image'], meta: { name: 'Image' } }
    /**
     * Find zero or one Image that matches the filter.
     * @param {ImageFindUniqueArgs} args - Arguments to find a Image
     * @example
     * // Get one Image
     * const image = await prisma.image.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends ImageFindUniqueArgs>(args: SelectSubset<T, ImageFindUniqueArgs<ExtArgs>>): Prisma__ImageClient<$Result.GetResult<Prisma.$ImagePayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Image that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {ImageFindUniqueOrThrowArgs} args - Arguments to find a Image
     * @example
     * // Get one Image
     * const image = await prisma.image.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends ImageFindUniqueOrThrowArgs>(args: SelectSubset<T, ImageFindUniqueOrThrowArgs<ExtArgs>>): Prisma__ImageClient<$Result.GetResult<Prisma.$ImagePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Image that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ImageFindFirstArgs} args - Arguments to find a Image
     * @example
     * // Get one Image
     * const image = await prisma.image.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends ImageFindFirstArgs>(args?: SelectSubset<T, ImageFindFirstArgs<ExtArgs>>): Prisma__ImageClient<$Result.GetResult<Prisma.$ImagePayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Image that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ImageFindFirstOrThrowArgs} args - Arguments to find a Image
     * @example
     * // Get one Image
     * const image = await prisma.image.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends ImageFindFirstOrThrowArgs>(args?: SelectSubset<T, ImageFindFirstOrThrowArgs<ExtArgs>>): Prisma__ImageClient<$Result.GetResult<Prisma.$ImagePayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Images that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ImageFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Images
     * const images = await prisma.image.findMany()
     * 
     * // Get first 10 Images
     * const images = await prisma.image.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const imageWithIdOnly = await prisma.image.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends ImageFindManyArgs>(args?: SelectSubset<T, ImageFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ImagePayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Image.
     * @param {ImageCreateArgs} args - Arguments to create a Image.
     * @example
     * // Create one Image
     * const Image = await prisma.image.create({
     *   data: {
     *     // ... data to create a Image
     *   }
     * })
     * 
     */
    create<T extends ImageCreateArgs>(args: SelectSubset<T, ImageCreateArgs<ExtArgs>>): Prisma__ImageClient<$Result.GetResult<Prisma.$ImagePayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Images.
     * @param {ImageCreateManyArgs} args - Arguments to create many Images.
     * @example
     * // Create many Images
     * const image = await prisma.image.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends ImageCreateManyArgs>(args?: SelectSubset<T, ImageCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Delete a Image.
     * @param {ImageDeleteArgs} args - Arguments to delete one Image.
     * @example
     * // Delete one Image
     * const Image = await prisma.image.delete({
     *   where: {
     *     // ... filter to delete one Image
     *   }
     * })
     * 
     */
    delete<T extends ImageDeleteArgs>(args: SelectSubset<T, ImageDeleteArgs<ExtArgs>>): Prisma__ImageClient<$Result.GetResult<Prisma.$ImagePayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Image.
     * @param {ImageUpdateArgs} args - Arguments to update one Image.
     * @example
     * // Update one Image
     * const image = await prisma.image.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends ImageUpdateArgs>(args: SelectSubset<T, ImageUpdateArgs<ExtArgs>>): Prisma__ImageClient<$Result.GetResult<Prisma.$ImagePayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Images.
     * @param {ImageDeleteManyArgs} args - Arguments to filter Images to delete.
     * @example
     * // Delete a few Images
     * const { count } = await prisma.image.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends ImageDeleteManyArgs>(args?: SelectSubset<T, ImageDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Images.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ImageUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Images
     * const image = await prisma.image.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends ImageUpdateManyArgs>(args: SelectSubset<T, ImageUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one Image.
     * @param {ImageUpsertArgs} args - Arguments to update or create a Image.
     * @example
     * // Update or create a Image
     * const image = await prisma.image.upsert({
     *   create: {
     *     // ... data to create a Image
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Image we want to update
     *   }
     * })
     */
    upsert<T extends ImageUpsertArgs>(args: SelectSubset<T, ImageUpsertArgs<ExtArgs>>): Prisma__ImageClient<$Result.GetResult<Prisma.$ImagePayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Images.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ImageCountArgs} args - Arguments to filter Images to count.
     * @example
     * // Count the number of Images
     * const count = await prisma.image.count({
     *   where: {
     *     // ... the filter for the Images we want to count
     *   }
     * })
    **/
    count<T extends ImageCountArgs>(
      args?: Subset<T, ImageCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], ImageCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Image.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ImageAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends ImageAggregateArgs>(args: Subset<T, ImageAggregateArgs>): Prisma.PrismaPromise<GetImageAggregateType<T>>

    /**
     * Group by Image.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ImageGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends ImageGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: ImageGroupByArgs['orderBy'] }
        : { orderBy?: ImageGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, ImageGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetImageGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Image model
   */
  readonly fields: ImageFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Image.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__ImageClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Image model
   */
  interface ImageFieldRefs {
    readonly id: FieldRef<"Image", 'String'>
    readonly data: FieldRef<"Image", 'Bytes'>
    readonly mimeType: FieldRef<"Image", 'String'>
    readonly createdAt: FieldRef<"Image", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Image findUnique
   */
  export type ImageFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Image
     */
    select?: ImageSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Image
     */
    omit?: ImageOmit<ExtArgs> | null
    /**
     * Filter, which Image to fetch.
     */
    where: ImageWhereUniqueInput
  }

  /**
   * Image findUniqueOrThrow
   */
  export type ImageFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Image
     */
    select?: ImageSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Image
     */
    omit?: ImageOmit<ExtArgs> | null
    /**
     * Filter, which Image to fetch.
     */
    where: ImageWhereUniqueInput
  }

  /**
   * Image findFirst
   */
  export type ImageFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Image
     */
    select?: ImageSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Image
     */
    omit?: ImageOmit<ExtArgs> | null
    /**
     * Filter, which Image to fetch.
     */
    where?: ImageWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Images to fetch.
     */
    orderBy?: ImageOrderByWithRelationInput | ImageOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Images.
     */
    cursor?: ImageWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Images from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Images.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Images.
     */
    distinct?: ImageScalarFieldEnum | ImageScalarFieldEnum[]
  }

  /**
   * Image findFirstOrThrow
   */
  export type ImageFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Image
     */
    select?: ImageSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Image
     */
    omit?: ImageOmit<ExtArgs> | null
    /**
     * Filter, which Image to fetch.
     */
    where?: ImageWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Images to fetch.
     */
    orderBy?: ImageOrderByWithRelationInput | ImageOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Images.
     */
    cursor?: ImageWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Images from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Images.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Images.
     */
    distinct?: ImageScalarFieldEnum | ImageScalarFieldEnum[]
  }

  /**
   * Image findMany
   */
  export type ImageFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Image
     */
    select?: ImageSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Image
     */
    omit?: ImageOmit<ExtArgs> | null
    /**
     * Filter, which Images to fetch.
     */
    where?: ImageWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Images to fetch.
     */
    orderBy?: ImageOrderByWithRelationInput | ImageOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Images.
     */
    cursor?: ImageWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Images from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Images.
     */
    skip?: number
    distinct?: ImageScalarFieldEnum | ImageScalarFieldEnum[]
  }

  /**
   * Image create
   */
  export type ImageCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Image
     */
    select?: ImageSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Image
     */
    omit?: ImageOmit<ExtArgs> | null
    /**
     * The data needed to create a Image.
     */
    data: XOR<ImageCreateInput, ImageUncheckedCreateInput>
  }

  /**
   * Image createMany
   */
  export type ImageCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Images.
     */
    data: ImageCreateManyInput | ImageCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Image update
   */
  export type ImageUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Image
     */
    select?: ImageSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Image
     */
    omit?: ImageOmit<ExtArgs> | null
    /**
     * The data needed to update a Image.
     */
    data: XOR<ImageUpdateInput, ImageUncheckedUpdateInput>
    /**
     * Choose, which Image to update.
     */
    where: ImageWhereUniqueInput
  }

  /**
   * Image updateMany
   */
  export type ImageUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Images.
     */
    data: XOR<ImageUpdateManyMutationInput, ImageUncheckedUpdateManyInput>
    /**
     * Filter which Images to update
     */
    where?: ImageWhereInput
    /**
     * Limit how many Images to update.
     */
    limit?: number
  }

  /**
   * Image upsert
   */
  export type ImageUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Image
     */
    select?: ImageSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Image
     */
    omit?: ImageOmit<ExtArgs> | null
    /**
     * The filter to search for the Image to update in case it exists.
     */
    where: ImageWhereUniqueInput
    /**
     * In case the Image found by the `where` argument doesn't exist, create a new Image with this data.
     */
    create: XOR<ImageCreateInput, ImageUncheckedCreateInput>
    /**
     * In case the Image was found with the provided `where` argument, update it with this data.
     */
    update: XOR<ImageUpdateInput, ImageUncheckedUpdateInput>
  }

  /**
   * Image delete
   */
  export type ImageDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Image
     */
    select?: ImageSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Image
     */
    omit?: ImageOmit<ExtArgs> | null
    /**
     * Filter which Image to delete.
     */
    where: ImageWhereUniqueInput
  }

  /**
   * Image deleteMany
   */
  export type ImageDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Images to delete
     */
    where?: ImageWhereInput
    /**
     * Limit how many Images to delete.
     */
    limit?: number
  }

  /**
   * Image without action
   */
  export type ImageDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Image
     */
    select?: ImageSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Image
     */
    omit?: ImageOmit<ExtArgs> | null
  }


  /**
   * Model TenantIntegration
   */

  export type AggregateTenantIntegration = {
    _count: TenantIntegrationCountAggregateOutputType | null
    _min: TenantIntegrationMinAggregateOutputType | null
    _max: TenantIntegrationMaxAggregateOutputType | null
  }

  export type TenantIntegrationMinAggregateOutputType = {
    id: string | null
    tenantId: string | null
    provider: string | null
    status: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type TenantIntegrationMaxAggregateOutputType = {
    id: string | null
    tenantId: string | null
    provider: string | null
    status: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type TenantIntegrationCountAggregateOutputType = {
    id: number
    tenantId: number
    provider: number
    status: number
    credentials: number
    settings: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type TenantIntegrationMinAggregateInputType = {
    id?: true
    tenantId?: true
    provider?: true
    status?: true
    createdAt?: true
    updatedAt?: true
  }

  export type TenantIntegrationMaxAggregateInputType = {
    id?: true
    tenantId?: true
    provider?: true
    status?: true
    createdAt?: true
    updatedAt?: true
  }

  export type TenantIntegrationCountAggregateInputType = {
    id?: true
    tenantId?: true
    provider?: true
    status?: true
    credentials?: true
    settings?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type TenantIntegrationAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which TenantIntegration to aggregate.
     */
    where?: TenantIntegrationWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of TenantIntegrations to fetch.
     */
    orderBy?: TenantIntegrationOrderByWithRelationInput | TenantIntegrationOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: TenantIntegrationWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` TenantIntegrations from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` TenantIntegrations.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned TenantIntegrations
    **/
    _count?: true | TenantIntegrationCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: TenantIntegrationMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: TenantIntegrationMaxAggregateInputType
  }

  export type GetTenantIntegrationAggregateType<T extends TenantIntegrationAggregateArgs> = {
        [P in keyof T & keyof AggregateTenantIntegration]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateTenantIntegration[P]>
      : GetScalarType<T[P], AggregateTenantIntegration[P]>
  }




  export type TenantIntegrationGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: TenantIntegrationWhereInput
    orderBy?: TenantIntegrationOrderByWithAggregationInput | TenantIntegrationOrderByWithAggregationInput[]
    by: TenantIntegrationScalarFieldEnum[] | TenantIntegrationScalarFieldEnum
    having?: TenantIntegrationScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: TenantIntegrationCountAggregateInputType | true
    _min?: TenantIntegrationMinAggregateInputType
    _max?: TenantIntegrationMaxAggregateInputType
  }

  export type TenantIntegrationGroupByOutputType = {
    id: string
    tenantId: string
    provider: string
    status: string
    credentials: JsonValue
    settings: JsonValue
    createdAt: Date
    updatedAt: Date
    _count: TenantIntegrationCountAggregateOutputType | null
    _min: TenantIntegrationMinAggregateOutputType | null
    _max: TenantIntegrationMaxAggregateOutputType | null
  }

  type GetTenantIntegrationGroupByPayload<T extends TenantIntegrationGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<TenantIntegrationGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof TenantIntegrationGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], TenantIntegrationGroupByOutputType[P]>
            : GetScalarType<T[P], TenantIntegrationGroupByOutputType[P]>
        }
      >
    >


  export type TenantIntegrationSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    tenantId?: boolean
    provider?: boolean
    status?: boolean
    credentials?: boolean
    settings?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["tenantIntegration"]>



  export type TenantIntegrationSelectScalar = {
    id?: boolean
    tenantId?: boolean
    provider?: boolean
    status?: boolean
    credentials?: boolean
    settings?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type TenantIntegrationOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "tenantId" | "provider" | "status" | "credentials" | "settings" | "createdAt" | "updatedAt", ExtArgs["result"]["tenantIntegration"]>
  export type TenantIntegrationInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    tenant?: boolean | TenantDefaultArgs<ExtArgs>
  }

  export type $TenantIntegrationPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "TenantIntegration"
    objects: {
      tenant: Prisma.$TenantPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      tenantId: string
      provider: string
      status: string
      credentials: Prisma.JsonValue
      settings: Prisma.JsonValue
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["tenantIntegration"]>
    composites: {}
  }

  type TenantIntegrationGetPayload<S extends boolean | null | undefined | TenantIntegrationDefaultArgs> = $Result.GetResult<Prisma.$TenantIntegrationPayload, S>

  type TenantIntegrationCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<TenantIntegrationFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: TenantIntegrationCountAggregateInputType | true
    }

  export interface TenantIntegrationDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['TenantIntegration'], meta: { name: 'TenantIntegration' } }
    /**
     * Find zero or one TenantIntegration that matches the filter.
     * @param {TenantIntegrationFindUniqueArgs} args - Arguments to find a TenantIntegration
     * @example
     * // Get one TenantIntegration
     * const tenantIntegration = await prisma.tenantIntegration.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends TenantIntegrationFindUniqueArgs>(args: SelectSubset<T, TenantIntegrationFindUniqueArgs<ExtArgs>>): Prisma__TenantIntegrationClient<$Result.GetResult<Prisma.$TenantIntegrationPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one TenantIntegration that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {TenantIntegrationFindUniqueOrThrowArgs} args - Arguments to find a TenantIntegration
     * @example
     * // Get one TenantIntegration
     * const tenantIntegration = await prisma.tenantIntegration.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends TenantIntegrationFindUniqueOrThrowArgs>(args: SelectSubset<T, TenantIntegrationFindUniqueOrThrowArgs<ExtArgs>>): Prisma__TenantIntegrationClient<$Result.GetResult<Prisma.$TenantIntegrationPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first TenantIntegration that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TenantIntegrationFindFirstArgs} args - Arguments to find a TenantIntegration
     * @example
     * // Get one TenantIntegration
     * const tenantIntegration = await prisma.tenantIntegration.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends TenantIntegrationFindFirstArgs>(args?: SelectSubset<T, TenantIntegrationFindFirstArgs<ExtArgs>>): Prisma__TenantIntegrationClient<$Result.GetResult<Prisma.$TenantIntegrationPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first TenantIntegration that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TenantIntegrationFindFirstOrThrowArgs} args - Arguments to find a TenantIntegration
     * @example
     * // Get one TenantIntegration
     * const tenantIntegration = await prisma.tenantIntegration.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends TenantIntegrationFindFirstOrThrowArgs>(args?: SelectSubset<T, TenantIntegrationFindFirstOrThrowArgs<ExtArgs>>): Prisma__TenantIntegrationClient<$Result.GetResult<Prisma.$TenantIntegrationPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more TenantIntegrations that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TenantIntegrationFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all TenantIntegrations
     * const tenantIntegrations = await prisma.tenantIntegration.findMany()
     * 
     * // Get first 10 TenantIntegrations
     * const tenantIntegrations = await prisma.tenantIntegration.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const tenantIntegrationWithIdOnly = await prisma.tenantIntegration.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends TenantIntegrationFindManyArgs>(args?: SelectSubset<T, TenantIntegrationFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TenantIntegrationPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a TenantIntegration.
     * @param {TenantIntegrationCreateArgs} args - Arguments to create a TenantIntegration.
     * @example
     * // Create one TenantIntegration
     * const TenantIntegration = await prisma.tenantIntegration.create({
     *   data: {
     *     // ... data to create a TenantIntegration
     *   }
     * })
     * 
     */
    create<T extends TenantIntegrationCreateArgs>(args: SelectSubset<T, TenantIntegrationCreateArgs<ExtArgs>>): Prisma__TenantIntegrationClient<$Result.GetResult<Prisma.$TenantIntegrationPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many TenantIntegrations.
     * @param {TenantIntegrationCreateManyArgs} args - Arguments to create many TenantIntegrations.
     * @example
     * // Create many TenantIntegrations
     * const tenantIntegration = await prisma.tenantIntegration.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends TenantIntegrationCreateManyArgs>(args?: SelectSubset<T, TenantIntegrationCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Delete a TenantIntegration.
     * @param {TenantIntegrationDeleteArgs} args - Arguments to delete one TenantIntegration.
     * @example
     * // Delete one TenantIntegration
     * const TenantIntegration = await prisma.tenantIntegration.delete({
     *   where: {
     *     // ... filter to delete one TenantIntegration
     *   }
     * })
     * 
     */
    delete<T extends TenantIntegrationDeleteArgs>(args: SelectSubset<T, TenantIntegrationDeleteArgs<ExtArgs>>): Prisma__TenantIntegrationClient<$Result.GetResult<Prisma.$TenantIntegrationPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one TenantIntegration.
     * @param {TenantIntegrationUpdateArgs} args - Arguments to update one TenantIntegration.
     * @example
     * // Update one TenantIntegration
     * const tenantIntegration = await prisma.tenantIntegration.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends TenantIntegrationUpdateArgs>(args: SelectSubset<T, TenantIntegrationUpdateArgs<ExtArgs>>): Prisma__TenantIntegrationClient<$Result.GetResult<Prisma.$TenantIntegrationPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more TenantIntegrations.
     * @param {TenantIntegrationDeleteManyArgs} args - Arguments to filter TenantIntegrations to delete.
     * @example
     * // Delete a few TenantIntegrations
     * const { count } = await prisma.tenantIntegration.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends TenantIntegrationDeleteManyArgs>(args?: SelectSubset<T, TenantIntegrationDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more TenantIntegrations.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TenantIntegrationUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many TenantIntegrations
     * const tenantIntegration = await prisma.tenantIntegration.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends TenantIntegrationUpdateManyArgs>(args: SelectSubset<T, TenantIntegrationUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one TenantIntegration.
     * @param {TenantIntegrationUpsertArgs} args - Arguments to update or create a TenantIntegration.
     * @example
     * // Update or create a TenantIntegration
     * const tenantIntegration = await prisma.tenantIntegration.upsert({
     *   create: {
     *     // ... data to create a TenantIntegration
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the TenantIntegration we want to update
     *   }
     * })
     */
    upsert<T extends TenantIntegrationUpsertArgs>(args: SelectSubset<T, TenantIntegrationUpsertArgs<ExtArgs>>): Prisma__TenantIntegrationClient<$Result.GetResult<Prisma.$TenantIntegrationPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of TenantIntegrations.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TenantIntegrationCountArgs} args - Arguments to filter TenantIntegrations to count.
     * @example
     * // Count the number of TenantIntegrations
     * const count = await prisma.tenantIntegration.count({
     *   where: {
     *     // ... the filter for the TenantIntegrations we want to count
     *   }
     * })
    **/
    count<T extends TenantIntegrationCountArgs>(
      args?: Subset<T, TenantIntegrationCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], TenantIntegrationCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a TenantIntegration.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TenantIntegrationAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends TenantIntegrationAggregateArgs>(args: Subset<T, TenantIntegrationAggregateArgs>): Prisma.PrismaPromise<GetTenantIntegrationAggregateType<T>>

    /**
     * Group by TenantIntegration.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TenantIntegrationGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends TenantIntegrationGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: TenantIntegrationGroupByArgs['orderBy'] }
        : { orderBy?: TenantIntegrationGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, TenantIntegrationGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetTenantIntegrationGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the TenantIntegration model
   */
  readonly fields: TenantIntegrationFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for TenantIntegration.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__TenantIntegrationClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    tenant<T extends TenantDefaultArgs<ExtArgs> = {}>(args?: Subset<T, TenantDefaultArgs<ExtArgs>>): Prisma__TenantClient<$Result.GetResult<Prisma.$TenantPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the TenantIntegration model
   */
  interface TenantIntegrationFieldRefs {
    readonly id: FieldRef<"TenantIntegration", 'String'>
    readonly tenantId: FieldRef<"TenantIntegration", 'String'>
    readonly provider: FieldRef<"TenantIntegration", 'String'>
    readonly status: FieldRef<"TenantIntegration", 'String'>
    readonly credentials: FieldRef<"TenantIntegration", 'Json'>
    readonly settings: FieldRef<"TenantIntegration", 'Json'>
    readonly createdAt: FieldRef<"TenantIntegration", 'DateTime'>
    readonly updatedAt: FieldRef<"TenantIntegration", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * TenantIntegration findUnique
   */
  export type TenantIntegrationFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TenantIntegration
     */
    select?: TenantIntegrationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TenantIntegration
     */
    omit?: TenantIntegrationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TenantIntegrationInclude<ExtArgs> | null
    /**
     * Filter, which TenantIntegration to fetch.
     */
    where: TenantIntegrationWhereUniqueInput
  }

  /**
   * TenantIntegration findUniqueOrThrow
   */
  export type TenantIntegrationFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TenantIntegration
     */
    select?: TenantIntegrationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TenantIntegration
     */
    omit?: TenantIntegrationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TenantIntegrationInclude<ExtArgs> | null
    /**
     * Filter, which TenantIntegration to fetch.
     */
    where: TenantIntegrationWhereUniqueInput
  }

  /**
   * TenantIntegration findFirst
   */
  export type TenantIntegrationFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TenantIntegration
     */
    select?: TenantIntegrationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TenantIntegration
     */
    omit?: TenantIntegrationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TenantIntegrationInclude<ExtArgs> | null
    /**
     * Filter, which TenantIntegration to fetch.
     */
    where?: TenantIntegrationWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of TenantIntegrations to fetch.
     */
    orderBy?: TenantIntegrationOrderByWithRelationInput | TenantIntegrationOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for TenantIntegrations.
     */
    cursor?: TenantIntegrationWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` TenantIntegrations from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` TenantIntegrations.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of TenantIntegrations.
     */
    distinct?: TenantIntegrationScalarFieldEnum | TenantIntegrationScalarFieldEnum[]
  }

  /**
   * TenantIntegration findFirstOrThrow
   */
  export type TenantIntegrationFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TenantIntegration
     */
    select?: TenantIntegrationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TenantIntegration
     */
    omit?: TenantIntegrationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TenantIntegrationInclude<ExtArgs> | null
    /**
     * Filter, which TenantIntegration to fetch.
     */
    where?: TenantIntegrationWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of TenantIntegrations to fetch.
     */
    orderBy?: TenantIntegrationOrderByWithRelationInput | TenantIntegrationOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for TenantIntegrations.
     */
    cursor?: TenantIntegrationWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` TenantIntegrations from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` TenantIntegrations.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of TenantIntegrations.
     */
    distinct?: TenantIntegrationScalarFieldEnum | TenantIntegrationScalarFieldEnum[]
  }

  /**
   * TenantIntegration findMany
   */
  export type TenantIntegrationFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TenantIntegration
     */
    select?: TenantIntegrationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TenantIntegration
     */
    omit?: TenantIntegrationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TenantIntegrationInclude<ExtArgs> | null
    /**
     * Filter, which TenantIntegrations to fetch.
     */
    where?: TenantIntegrationWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of TenantIntegrations to fetch.
     */
    orderBy?: TenantIntegrationOrderByWithRelationInput | TenantIntegrationOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing TenantIntegrations.
     */
    cursor?: TenantIntegrationWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` TenantIntegrations from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` TenantIntegrations.
     */
    skip?: number
    distinct?: TenantIntegrationScalarFieldEnum | TenantIntegrationScalarFieldEnum[]
  }

  /**
   * TenantIntegration create
   */
  export type TenantIntegrationCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TenantIntegration
     */
    select?: TenantIntegrationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TenantIntegration
     */
    omit?: TenantIntegrationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TenantIntegrationInclude<ExtArgs> | null
    /**
     * The data needed to create a TenantIntegration.
     */
    data: XOR<TenantIntegrationCreateInput, TenantIntegrationUncheckedCreateInput>
  }

  /**
   * TenantIntegration createMany
   */
  export type TenantIntegrationCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many TenantIntegrations.
     */
    data: TenantIntegrationCreateManyInput | TenantIntegrationCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * TenantIntegration update
   */
  export type TenantIntegrationUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TenantIntegration
     */
    select?: TenantIntegrationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TenantIntegration
     */
    omit?: TenantIntegrationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TenantIntegrationInclude<ExtArgs> | null
    /**
     * The data needed to update a TenantIntegration.
     */
    data: XOR<TenantIntegrationUpdateInput, TenantIntegrationUncheckedUpdateInput>
    /**
     * Choose, which TenantIntegration to update.
     */
    where: TenantIntegrationWhereUniqueInput
  }

  /**
   * TenantIntegration updateMany
   */
  export type TenantIntegrationUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update TenantIntegrations.
     */
    data: XOR<TenantIntegrationUpdateManyMutationInput, TenantIntegrationUncheckedUpdateManyInput>
    /**
     * Filter which TenantIntegrations to update
     */
    where?: TenantIntegrationWhereInput
    /**
     * Limit how many TenantIntegrations to update.
     */
    limit?: number
  }

  /**
   * TenantIntegration upsert
   */
  export type TenantIntegrationUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TenantIntegration
     */
    select?: TenantIntegrationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TenantIntegration
     */
    omit?: TenantIntegrationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TenantIntegrationInclude<ExtArgs> | null
    /**
     * The filter to search for the TenantIntegration to update in case it exists.
     */
    where: TenantIntegrationWhereUniqueInput
    /**
     * In case the TenantIntegration found by the `where` argument doesn't exist, create a new TenantIntegration with this data.
     */
    create: XOR<TenantIntegrationCreateInput, TenantIntegrationUncheckedCreateInput>
    /**
     * In case the TenantIntegration was found with the provided `where` argument, update it with this data.
     */
    update: XOR<TenantIntegrationUpdateInput, TenantIntegrationUncheckedUpdateInput>
  }

  /**
   * TenantIntegration delete
   */
  export type TenantIntegrationDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TenantIntegration
     */
    select?: TenantIntegrationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TenantIntegration
     */
    omit?: TenantIntegrationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TenantIntegrationInclude<ExtArgs> | null
    /**
     * Filter which TenantIntegration to delete.
     */
    where: TenantIntegrationWhereUniqueInput
  }

  /**
   * TenantIntegration deleteMany
   */
  export type TenantIntegrationDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which TenantIntegrations to delete
     */
    where?: TenantIntegrationWhereInput
    /**
     * Limit how many TenantIntegrations to delete.
     */
    limit?: number
  }

  /**
   * TenantIntegration without action
   */
  export type TenantIntegrationDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TenantIntegration
     */
    select?: TenantIntegrationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the TenantIntegration
     */
    omit?: TenantIntegrationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TenantIntegrationInclude<ExtArgs> | null
  }


  /**
   * Enums
   */

  export const TransactionIsolationLevel: {
    ReadUncommitted: 'ReadUncommitted',
    ReadCommitted: 'ReadCommitted',
    RepeatableRead: 'RepeatableRead',
    Serializable: 'Serializable'
  };

  export type TransactionIsolationLevel = (typeof TransactionIsolationLevel)[keyof typeof TransactionIsolationLevel]


  export const TenantScalarFieldEnum: {
    id: 'id',
    databaseName: 'databaseName',
    databaseUrl: 'databaseUrl',
    name: 'name',
    status: 'status',
    logoUrl: 'logoUrl',
    modulos: 'modulos',
    razaoSocial: 'razaoSocial',
    nomeFantasia: 'nomeFantasia',
    cnpj: 'cnpj',
    ie: 'ie',
    im: 'im',
    crt: 'crt',
    logradouro: 'logradouro',
    numero: 'numero',
    complemento: 'complemento',
    bairro: 'bairro',
    municipio: 'municipio',
    codMunicipio: 'codMunicipio',
    uf: 'uf',
    cep: 'cep',
    telefone: 'telefone',
    emailContador: 'emailContador',
    nfceAtivo: 'nfceAtivo',
    nfceAutoSync: 'nfceAutoSync',
    nfceSerie: 'nfceSerie',
    nfceAmbiente: 'nfceAmbiente',
    nfceCsc: 'nfceCsc',
    nfceIdCsc: 'nfceIdCsc',
    certPfx: 'certPfx',
    certSenha: 'certSenha',
    certValidade: 'certValidade',
    cosmosApiKey: 'cosmosApiKey',
    mensalidadeValor: 'mensalidadeValor',
    mensalidadeVencimento: 'mensalidadeVencimento',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
    termsAcceptedAt: 'termsAcceptedAt'
  };

  export type TenantScalarFieldEnum = (typeof TenantScalarFieldEnum)[keyof typeof TenantScalarFieldEnum]


  export const UserScalarFieldEnum: {
    id: 'id',
    tenantId: 'tenantId',
    name: 'name',
    email: 'email',
    password: 'password',
    role: 'role',
    pin: 'pin',
    active: 'active',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type UserScalarFieldEnum = (typeof UserScalarFieldEnum)[keyof typeof UserScalarFieldEnum]


  export const MasterProductScalarFieldEnum: {
    id: 'id',
    ean: 'ean',
    name: 'name',
    brand: 'brand',
    ncm: 'ncm',
    cest: 'cest',
    unit: 'unit',
    imageUrl: 'imageUrl',
    category: 'category',
    source: 'source',
    createdAt: 'createdAt'
  };

  export type MasterProductScalarFieldEnum = (typeof MasterProductScalarFieldEnum)[keyof typeof MasterProductScalarFieldEnum]


  export const ImageScalarFieldEnum: {
    id: 'id',
    data: 'data',
    mimeType: 'mimeType',
    createdAt: 'createdAt'
  };

  export type ImageScalarFieldEnum = (typeof ImageScalarFieldEnum)[keyof typeof ImageScalarFieldEnum]


  export const TenantIntegrationScalarFieldEnum: {
    id: 'id',
    tenantId: 'tenantId',
    provider: 'provider',
    status: 'status',
    credentials: 'credentials',
    settings: 'settings',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type TenantIntegrationScalarFieldEnum = (typeof TenantIntegrationScalarFieldEnum)[keyof typeof TenantIntegrationScalarFieldEnum]


  export const SortOrder: {
    asc: 'asc',
    desc: 'desc'
  };

  export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder]


  export const NullableJsonNullValueInput: {
    DbNull: typeof DbNull,
    JsonNull: typeof JsonNull
  };

  export type NullableJsonNullValueInput = (typeof NullableJsonNullValueInput)[keyof typeof NullableJsonNullValueInput]


  export const JsonNullValueInput: {
    JsonNull: typeof JsonNull
  };

  export type JsonNullValueInput = (typeof JsonNullValueInput)[keyof typeof JsonNullValueInput]


  export const JsonNullValueFilter: {
    DbNull: typeof DbNull,
    JsonNull: typeof JsonNull,
    AnyNull: typeof AnyNull
  };

  export type JsonNullValueFilter = (typeof JsonNullValueFilter)[keyof typeof JsonNullValueFilter]


  export const QueryMode: {
    default: 'default',
    insensitive: 'insensitive'
  };

  export type QueryMode = (typeof QueryMode)[keyof typeof QueryMode]


  export const NullsOrder: {
    first: 'first',
    last: 'last'
  };

  export type NullsOrder = (typeof NullsOrder)[keyof typeof NullsOrder]


  export const TenantOrderByRelevanceFieldEnum: {
    id: 'id',
    databaseName: 'databaseName',
    databaseUrl: 'databaseUrl',
    name: 'name',
    status: 'status',
    logoUrl: 'logoUrl',
    razaoSocial: 'razaoSocial',
    nomeFantasia: 'nomeFantasia',
    cnpj: 'cnpj',
    ie: 'ie',
    im: 'im',
    logradouro: 'logradouro',
    numero: 'numero',
    complemento: 'complemento',
    bairro: 'bairro',
    municipio: 'municipio',
    codMunicipio: 'codMunicipio',
    uf: 'uf',
    cep: 'cep',
    telefone: 'telefone',
    emailContador: 'emailContador',
    nfceCsc: 'nfceCsc',
    nfceIdCsc: 'nfceIdCsc',
    certSenha: 'certSenha',
    cosmosApiKey: 'cosmosApiKey'
  };

  export type TenantOrderByRelevanceFieldEnum = (typeof TenantOrderByRelevanceFieldEnum)[keyof typeof TenantOrderByRelevanceFieldEnum]


  export const UserOrderByRelevanceFieldEnum: {
    id: 'id',
    tenantId: 'tenantId',
    name: 'name',
    email: 'email',
    password: 'password',
    role: 'role',
    pin: 'pin'
  };

  export type UserOrderByRelevanceFieldEnum = (typeof UserOrderByRelevanceFieldEnum)[keyof typeof UserOrderByRelevanceFieldEnum]


  export const MasterProductOrderByRelevanceFieldEnum: {
    id: 'id',
    ean: 'ean',
    name: 'name',
    brand: 'brand',
    ncm: 'ncm',
    cest: 'cest',
    unit: 'unit',
    imageUrl: 'imageUrl',
    category: 'category',
    source: 'source'
  };

  export type MasterProductOrderByRelevanceFieldEnum = (typeof MasterProductOrderByRelevanceFieldEnum)[keyof typeof MasterProductOrderByRelevanceFieldEnum]


  export const ImageOrderByRelevanceFieldEnum: {
    id: 'id',
    mimeType: 'mimeType'
  };

  export type ImageOrderByRelevanceFieldEnum = (typeof ImageOrderByRelevanceFieldEnum)[keyof typeof ImageOrderByRelevanceFieldEnum]


  export const TenantIntegrationOrderByRelevanceFieldEnum: {
    id: 'id',
    tenantId: 'tenantId',
    provider: 'provider',
    status: 'status'
  };

  export type TenantIntegrationOrderByRelevanceFieldEnum = (typeof TenantIntegrationOrderByRelevanceFieldEnum)[keyof typeof TenantIntegrationOrderByRelevanceFieldEnum]


  /**
   * Field references
   */


  /**
   * Reference to a field of type 'String'
   */
  export type StringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String'>
    


  /**
   * Reference to a field of type 'Json'
   */
  export type JsonFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Json'>
    


  /**
   * Reference to a field of type 'QueryMode'
   */
  export type EnumQueryModeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'QueryMode'>
    


  /**
   * Reference to a field of type 'Int'
   */
  export type IntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int'>
    


  /**
   * Reference to a field of type 'Boolean'
   */
  export type BooleanFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Boolean'>
    


  /**
   * Reference to a field of type 'Bytes'
   */
  export type BytesFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Bytes'>
    


  /**
   * Reference to a field of type 'DateTime'
   */
  export type DateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime'>
    


  /**
   * Reference to a field of type 'Decimal'
   */
  export type DecimalFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Decimal'>
    


  /**
   * Reference to a field of type 'Float'
   */
  export type FloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float'>
    
  /**
   * Deep Input Types
   */


  export type TenantWhereInput = {
    AND?: TenantWhereInput | TenantWhereInput[]
    OR?: TenantWhereInput[]
    NOT?: TenantWhereInput | TenantWhereInput[]
    id?: StringFilter<"Tenant"> | string
    databaseName?: StringFilter<"Tenant"> | string
    databaseUrl?: StringFilter<"Tenant"> | string
    name?: StringFilter<"Tenant"> | string
    status?: StringFilter<"Tenant"> | string
    logoUrl?: StringNullableFilter<"Tenant"> | string | null
    modulos?: JsonNullableFilter<"Tenant">
    razaoSocial?: StringNullableFilter<"Tenant"> | string | null
    nomeFantasia?: StringNullableFilter<"Tenant"> | string | null
    cnpj?: StringNullableFilter<"Tenant"> | string | null
    ie?: StringNullableFilter<"Tenant"> | string | null
    im?: StringNullableFilter<"Tenant"> | string | null
    crt?: IntFilter<"Tenant"> | number
    logradouro?: StringNullableFilter<"Tenant"> | string | null
    numero?: StringNullableFilter<"Tenant"> | string | null
    complemento?: StringNullableFilter<"Tenant"> | string | null
    bairro?: StringNullableFilter<"Tenant"> | string | null
    municipio?: StringNullableFilter<"Tenant"> | string | null
    codMunicipio?: StringNullableFilter<"Tenant"> | string | null
    uf?: StringNullableFilter<"Tenant"> | string | null
    cep?: StringNullableFilter<"Tenant"> | string | null
    telefone?: StringNullableFilter<"Tenant"> | string | null
    emailContador?: StringNullableFilter<"Tenant"> | string | null
    nfceAtivo?: BoolFilter<"Tenant"> | boolean
    nfceAutoSync?: BoolFilter<"Tenant"> | boolean
    nfceSerie?: IntFilter<"Tenant"> | number
    nfceAmbiente?: IntFilter<"Tenant"> | number
    nfceCsc?: StringNullableFilter<"Tenant"> | string | null
    nfceIdCsc?: StringNullableFilter<"Tenant"> | string | null
    certPfx?: BytesNullableFilter<"Tenant"> | Bytes | null
    certSenha?: StringNullableFilter<"Tenant"> | string | null
    certValidade?: DateTimeNullableFilter<"Tenant"> | Date | string | null
    cosmosApiKey?: StringNullableFilter<"Tenant"> | string | null
    mensalidadeValor?: DecimalNullableFilter<"Tenant"> | Decimal | DecimalJsLike | number | string | null
    mensalidadeVencimento?: DateTimeNullableFilter<"Tenant"> | Date | string | null
    createdAt?: DateTimeFilter<"Tenant"> | Date | string
    updatedAt?: DateTimeFilter<"Tenant"> | Date | string
    termsAcceptedAt?: DateTimeNullableFilter<"Tenant"> | Date | string | null
    users?: UserListRelationFilter
    tenantIntegrations?: TenantIntegrationListRelationFilter
  }

  export type TenantOrderByWithRelationInput = {
    id?: SortOrder
    databaseName?: SortOrder
    databaseUrl?: SortOrder
    name?: SortOrder
    status?: SortOrder
    logoUrl?: SortOrderInput | SortOrder
    modulos?: SortOrderInput | SortOrder
    razaoSocial?: SortOrderInput | SortOrder
    nomeFantasia?: SortOrderInput | SortOrder
    cnpj?: SortOrderInput | SortOrder
    ie?: SortOrderInput | SortOrder
    im?: SortOrderInput | SortOrder
    crt?: SortOrder
    logradouro?: SortOrderInput | SortOrder
    numero?: SortOrderInput | SortOrder
    complemento?: SortOrderInput | SortOrder
    bairro?: SortOrderInput | SortOrder
    municipio?: SortOrderInput | SortOrder
    codMunicipio?: SortOrderInput | SortOrder
    uf?: SortOrderInput | SortOrder
    cep?: SortOrderInput | SortOrder
    telefone?: SortOrderInput | SortOrder
    emailContador?: SortOrderInput | SortOrder
    nfceAtivo?: SortOrder
    nfceAutoSync?: SortOrder
    nfceSerie?: SortOrder
    nfceAmbiente?: SortOrder
    nfceCsc?: SortOrderInput | SortOrder
    nfceIdCsc?: SortOrderInput | SortOrder
    certPfx?: SortOrderInput | SortOrder
    certSenha?: SortOrderInput | SortOrder
    certValidade?: SortOrderInput | SortOrder
    cosmosApiKey?: SortOrderInput | SortOrder
    mensalidadeValor?: SortOrderInput | SortOrder
    mensalidadeVencimento?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    termsAcceptedAt?: SortOrderInput | SortOrder
    users?: UserOrderByRelationAggregateInput
    tenantIntegrations?: TenantIntegrationOrderByRelationAggregateInput
    _relevance?: TenantOrderByRelevanceInput
  }

  export type TenantWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    databaseName?: string
    cnpj?: string
    AND?: TenantWhereInput | TenantWhereInput[]
    OR?: TenantWhereInput[]
    NOT?: TenantWhereInput | TenantWhereInput[]
    databaseUrl?: StringFilter<"Tenant"> | string
    name?: StringFilter<"Tenant"> | string
    status?: StringFilter<"Tenant"> | string
    logoUrl?: StringNullableFilter<"Tenant"> | string | null
    modulos?: JsonNullableFilter<"Tenant">
    razaoSocial?: StringNullableFilter<"Tenant"> | string | null
    nomeFantasia?: StringNullableFilter<"Tenant"> | string | null
    ie?: StringNullableFilter<"Tenant"> | string | null
    im?: StringNullableFilter<"Tenant"> | string | null
    crt?: IntFilter<"Tenant"> | number
    logradouro?: StringNullableFilter<"Tenant"> | string | null
    numero?: StringNullableFilter<"Tenant"> | string | null
    complemento?: StringNullableFilter<"Tenant"> | string | null
    bairro?: StringNullableFilter<"Tenant"> | string | null
    municipio?: StringNullableFilter<"Tenant"> | string | null
    codMunicipio?: StringNullableFilter<"Tenant"> | string | null
    uf?: StringNullableFilter<"Tenant"> | string | null
    cep?: StringNullableFilter<"Tenant"> | string | null
    telefone?: StringNullableFilter<"Tenant"> | string | null
    emailContador?: StringNullableFilter<"Tenant"> | string | null
    nfceAtivo?: BoolFilter<"Tenant"> | boolean
    nfceAutoSync?: BoolFilter<"Tenant"> | boolean
    nfceSerie?: IntFilter<"Tenant"> | number
    nfceAmbiente?: IntFilter<"Tenant"> | number
    nfceCsc?: StringNullableFilter<"Tenant"> | string | null
    nfceIdCsc?: StringNullableFilter<"Tenant"> | string | null
    certPfx?: BytesNullableFilter<"Tenant"> | Bytes | null
    certSenha?: StringNullableFilter<"Tenant"> | string | null
    certValidade?: DateTimeNullableFilter<"Tenant"> | Date | string | null
    cosmosApiKey?: StringNullableFilter<"Tenant"> | string | null
    mensalidadeValor?: DecimalNullableFilter<"Tenant"> | Decimal | DecimalJsLike | number | string | null
    mensalidadeVencimento?: DateTimeNullableFilter<"Tenant"> | Date | string | null
    createdAt?: DateTimeFilter<"Tenant"> | Date | string
    updatedAt?: DateTimeFilter<"Tenant"> | Date | string
    termsAcceptedAt?: DateTimeNullableFilter<"Tenant"> | Date | string | null
    users?: UserListRelationFilter
    tenantIntegrations?: TenantIntegrationListRelationFilter
  }, "id" | "databaseName" | "cnpj">

  export type TenantOrderByWithAggregationInput = {
    id?: SortOrder
    databaseName?: SortOrder
    databaseUrl?: SortOrder
    name?: SortOrder
    status?: SortOrder
    logoUrl?: SortOrderInput | SortOrder
    modulos?: SortOrderInput | SortOrder
    razaoSocial?: SortOrderInput | SortOrder
    nomeFantasia?: SortOrderInput | SortOrder
    cnpj?: SortOrderInput | SortOrder
    ie?: SortOrderInput | SortOrder
    im?: SortOrderInput | SortOrder
    crt?: SortOrder
    logradouro?: SortOrderInput | SortOrder
    numero?: SortOrderInput | SortOrder
    complemento?: SortOrderInput | SortOrder
    bairro?: SortOrderInput | SortOrder
    municipio?: SortOrderInput | SortOrder
    codMunicipio?: SortOrderInput | SortOrder
    uf?: SortOrderInput | SortOrder
    cep?: SortOrderInput | SortOrder
    telefone?: SortOrderInput | SortOrder
    emailContador?: SortOrderInput | SortOrder
    nfceAtivo?: SortOrder
    nfceAutoSync?: SortOrder
    nfceSerie?: SortOrder
    nfceAmbiente?: SortOrder
    nfceCsc?: SortOrderInput | SortOrder
    nfceIdCsc?: SortOrderInput | SortOrder
    certPfx?: SortOrderInput | SortOrder
    certSenha?: SortOrderInput | SortOrder
    certValidade?: SortOrderInput | SortOrder
    cosmosApiKey?: SortOrderInput | SortOrder
    mensalidadeValor?: SortOrderInput | SortOrder
    mensalidadeVencimento?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    termsAcceptedAt?: SortOrderInput | SortOrder
    _count?: TenantCountOrderByAggregateInput
    _avg?: TenantAvgOrderByAggregateInput
    _max?: TenantMaxOrderByAggregateInput
    _min?: TenantMinOrderByAggregateInput
    _sum?: TenantSumOrderByAggregateInput
  }

  export type TenantScalarWhereWithAggregatesInput = {
    AND?: TenantScalarWhereWithAggregatesInput | TenantScalarWhereWithAggregatesInput[]
    OR?: TenantScalarWhereWithAggregatesInput[]
    NOT?: TenantScalarWhereWithAggregatesInput | TenantScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Tenant"> | string
    databaseName?: StringWithAggregatesFilter<"Tenant"> | string
    databaseUrl?: StringWithAggregatesFilter<"Tenant"> | string
    name?: StringWithAggregatesFilter<"Tenant"> | string
    status?: StringWithAggregatesFilter<"Tenant"> | string
    logoUrl?: StringNullableWithAggregatesFilter<"Tenant"> | string | null
    modulos?: JsonNullableWithAggregatesFilter<"Tenant">
    razaoSocial?: StringNullableWithAggregatesFilter<"Tenant"> | string | null
    nomeFantasia?: StringNullableWithAggregatesFilter<"Tenant"> | string | null
    cnpj?: StringNullableWithAggregatesFilter<"Tenant"> | string | null
    ie?: StringNullableWithAggregatesFilter<"Tenant"> | string | null
    im?: StringNullableWithAggregatesFilter<"Tenant"> | string | null
    crt?: IntWithAggregatesFilter<"Tenant"> | number
    logradouro?: StringNullableWithAggregatesFilter<"Tenant"> | string | null
    numero?: StringNullableWithAggregatesFilter<"Tenant"> | string | null
    complemento?: StringNullableWithAggregatesFilter<"Tenant"> | string | null
    bairro?: StringNullableWithAggregatesFilter<"Tenant"> | string | null
    municipio?: StringNullableWithAggregatesFilter<"Tenant"> | string | null
    codMunicipio?: StringNullableWithAggregatesFilter<"Tenant"> | string | null
    uf?: StringNullableWithAggregatesFilter<"Tenant"> | string | null
    cep?: StringNullableWithAggregatesFilter<"Tenant"> | string | null
    telefone?: StringNullableWithAggregatesFilter<"Tenant"> | string | null
    emailContador?: StringNullableWithAggregatesFilter<"Tenant"> | string | null
    nfceAtivo?: BoolWithAggregatesFilter<"Tenant"> | boolean
    nfceAutoSync?: BoolWithAggregatesFilter<"Tenant"> | boolean
    nfceSerie?: IntWithAggregatesFilter<"Tenant"> | number
    nfceAmbiente?: IntWithAggregatesFilter<"Tenant"> | number
    nfceCsc?: StringNullableWithAggregatesFilter<"Tenant"> | string | null
    nfceIdCsc?: StringNullableWithAggregatesFilter<"Tenant"> | string | null
    certPfx?: BytesNullableWithAggregatesFilter<"Tenant"> | Bytes | null
    certSenha?: StringNullableWithAggregatesFilter<"Tenant"> | string | null
    certValidade?: DateTimeNullableWithAggregatesFilter<"Tenant"> | Date | string | null
    cosmosApiKey?: StringNullableWithAggregatesFilter<"Tenant"> | string | null
    mensalidadeValor?: DecimalNullableWithAggregatesFilter<"Tenant"> | Decimal | DecimalJsLike | number | string | null
    mensalidadeVencimento?: DateTimeNullableWithAggregatesFilter<"Tenant"> | Date | string | null
    createdAt?: DateTimeWithAggregatesFilter<"Tenant"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"Tenant"> | Date | string
    termsAcceptedAt?: DateTimeNullableWithAggregatesFilter<"Tenant"> | Date | string | null
  }

  export type UserWhereInput = {
    AND?: UserWhereInput | UserWhereInput[]
    OR?: UserWhereInput[]
    NOT?: UserWhereInput | UserWhereInput[]
    id?: StringFilter<"User"> | string
    tenantId?: StringFilter<"User"> | string
    name?: StringFilter<"User"> | string
    email?: StringFilter<"User"> | string
    password?: StringFilter<"User"> | string
    role?: StringFilter<"User"> | string
    pin?: StringNullableFilter<"User"> | string | null
    active?: BoolFilter<"User"> | boolean
    createdAt?: DateTimeFilter<"User"> | Date | string
    updatedAt?: DateTimeFilter<"User"> | Date | string
    tenant?: XOR<TenantScalarRelationFilter, TenantWhereInput>
  }

  export type UserOrderByWithRelationInput = {
    id?: SortOrder
    tenantId?: SortOrder
    name?: SortOrder
    email?: SortOrder
    password?: SortOrder
    role?: SortOrder
    pin?: SortOrderInput | SortOrder
    active?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    tenant?: TenantOrderByWithRelationInput
    _relevance?: UserOrderByRelevanceInput
  }

  export type UserWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    email?: string
    AND?: UserWhereInput | UserWhereInput[]
    OR?: UserWhereInput[]
    NOT?: UserWhereInput | UserWhereInput[]
    tenantId?: StringFilter<"User"> | string
    name?: StringFilter<"User"> | string
    password?: StringFilter<"User"> | string
    role?: StringFilter<"User"> | string
    pin?: StringNullableFilter<"User"> | string | null
    active?: BoolFilter<"User"> | boolean
    createdAt?: DateTimeFilter<"User"> | Date | string
    updatedAt?: DateTimeFilter<"User"> | Date | string
    tenant?: XOR<TenantScalarRelationFilter, TenantWhereInput>
  }, "id" | "email">

  export type UserOrderByWithAggregationInput = {
    id?: SortOrder
    tenantId?: SortOrder
    name?: SortOrder
    email?: SortOrder
    password?: SortOrder
    role?: SortOrder
    pin?: SortOrderInput | SortOrder
    active?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: UserCountOrderByAggregateInput
    _max?: UserMaxOrderByAggregateInput
    _min?: UserMinOrderByAggregateInput
  }

  export type UserScalarWhereWithAggregatesInput = {
    AND?: UserScalarWhereWithAggregatesInput | UserScalarWhereWithAggregatesInput[]
    OR?: UserScalarWhereWithAggregatesInput[]
    NOT?: UserScalarWhereWithAggregatesInput | UserScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"User"> | string
    tenantId?: StringWithAggregatesFilter<"User"> | string
    name?: StringWithAggregatesFilter<"User"> | string
    email?: StringWithAggregatesFilter<"User"> | string
    password?: StringWithAggregatesFilter<"User"> | string
    role?: StringWithAggregatesFilter<"User"> | string
    pin?: StringNullableWithAggregatesFilter<"User"> | string | null
    active?: BoolWithAggregatesFilter<"User"> | boolean
    createdAt?: DateTimeWithAggregatesFilter<"User"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"User"> | Date | string
  }

  export type MasterProductWhereInput = {
    AND?: MasterProductWhereInput | MasterProductWhereInput[]
    OR?: MasterProductWhereInput[]
    NOT?: MasterProductWhereInput | MasterProductWhereInput[]
    id?: StringFilter<"MasterProduct"> | string
    ean?: StringFilter<"MasterProduct"> | string
    name?: StringFilter<"MasterProduct"> | string
    brand?: StringNullableFilter<"MasterProduct"> | string | null
    ncm?: StringNullableFilter<"MasterProduct"> | string | null
    cest?: StringNullableFilter<"MasterProduct"> | string | null
    unit?: StringFilter<"MasterProduct"> | string
    imageUrl?: StringNullableFilter<"MasterProduct"> | string | null
    category?: StringNullableFilter<"MasterProduct"> | string | null
    source?: StringFilter<"MasterProduct"> | string
    createdAt?: DateTimeFilter<"MasterProduct"> | Date | string
  }

  export type MasterProductOrderByWithRelationInput = {
    id?: SortOrder
    ean?: SortOrder
    name?: SortOrder
    brand?: SortOrderInput | SortOrder
    ncm?: SortOrderInput | SortOrder
    cest?: SortOrderInput | SortOrder
    unit?: SortOrder
    imageUrl?: SortOrderInput | SortOrder
    category?: SortOrderInput | SortOrder
    source?: SortOrder
    createdAt?: SortOrder
    _relevance?: MasterProductOrderByRelevanceInput
  }

  export type MasterProductWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    ean?: string
    AND?: MasterProductWhereInput | MasterProductWhereInput[]
    OR?: MasterProductWhereInput[]
    NOT?: MasterProductWhereInput | MasterProductWhereInput[]
    name?: StringFilter<"MasterProduct"> | string
    brand?: StringNullableFilter<"MasterProduct"> | string | null
    ncm?: StringNullableFilter<"MasterProduct"> | string | null
    cest?: StringNullableFilter<"MasterProduct"> | string | null
    unit?: StringFilter<"MasterProduct"> | string
    imageUrl?: StringNullableFilter<"MasterProduct"> | string | null
    category?: StringNullableFilter<"MasterProduct"> | string | null
    source?: StringFilter<"MasterProduct"> | string
    createdAt?: DateTimeFilter<"MasterProduct"> | Date | string
  }, "id" | "ean">

  export type MasterProductOrderByWithAggregationInput = {
    id?: SortOrder
    ean?: SortOrder
    name?: SortOrder
    brand?: SortOrderInput | SortOrder
    ncm?: SortOrderInput | SortOrder
    cest?: SortOrderInput | SortOrder
    unit?: SortOrder
    imageUrl?: SortOrderInput | SortOrder
    category?: SortOrderInput | SortOrder
    source?: SortOrder
    createdAt?: SortOrder
    _count?: MasterProductCountOrderByAggregateInput
    _max?: MasterProductMaxOrderByAggregateInput
    _min?: MasterProductMinOrderByAggregateInput
  }

  export type MasterProductScalarWhereWithAggregatesInput = {
    AND?: MasterProductScalarWhereWithAggregatesInput | MasterProductScalarWhereWithAggregatesInput[]
    OR?: MasterProductScalarWhereWithAggregatesInput[]
    NOT?: MasterProductScalarWhereWithAggregatesInput | MasterProductScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"MasterProduct"> | string
    ean?: StringWithAggregatesFilter<"MasterProduct"> | string
    name?: StringWithAggregatesFilter<"MasterProduct"> | string
    brand?: StringNullableWithAggregatesFilter<"MasterProduct"> | string | null
    ncm?: StringNullableWithAggregatesFilter<"MasterProduct"> | string | null
    cest?: StringNullableWithAggregatesFilter<"MasterProduct"> | string | null
    unit?: StringWithAggregatesFilter<"MasterProduct"> | string
    imageUrl?: StringNullableWithAggregatesFilter<"MasterProduct"> | string | null
    category?: StringNullableWithAggregatesFilter<"MasterProduct"> | string | null
    source?: StringWithAggregatesFilter<"MasterProduct"> | string
    createdAt?: DateTimeWithAggregatesFilter<"MasterProduct"> | Date | string
  }

  export type ImageWhereInput = {
    AND?: ImageWhereInput | ImageWhereInput[]
    OR?: ImageWhereInput[]
    NOT?: ImageWhereInput | ImageWhereInput[]
    id?: StringFilter<"Image"> | string
    data?: BytesFilter<"Image"> | Bytes
    mimeType?: StringFilter<"Image"> | string
    createdAt?: DateTimeFilter<"Image"> | Date | string
  }

  export type ImageOrderByWithRelationInput = {
    id?: SortOrder
    data?: SortOrder
    mimeType?: SortOrder
    createdAt?: SortOrder
    _relevance?: ImageOrderByRelevanceInput
  }

  export type ImageWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: ImageWhereInput | ImageWhereInput[]
    OR?: ImageWhereInput[]
    NOT?: ImageWhereInput | ImageWhereInput[]
    data?: BytesFilter<"Image"> | Bytes
    mimeType?: StringFilter<"Image"> | string
    createdAt?: DateTimeFilter<"Image"> | Date | string
  }, "id">

  export type ImageOrderByWithAggregationInput = {
    id?: SortOrder
    data?: SortOrder
    mimeType?: SortOrder
    createdAt?: SortOrder
    _count?: ImageCountOrderByAggregateInput
    _max?: ImageMaxOrderByAggregateInput
    _min?: ImageMinOrderByAggregateInput
  }

  export type ImageScalarWhereWithAggregatesInput = {
    AND?: ImageScalarWhereWithAggregatesInput | ImageScalarWhereWithAggregatesInput[]
    OR?: ImageScalarWhereWithAggregatesInput[]
    NOT?: ImageScalarWhereWithAggregatesInput | ImageScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Image"> | string
    data?: BytesWithAggregatesFilter<"Image"> | Bytes
    mimeType?: StringWithAggregatesFilter<"Image"> | string
    createdAt?: DateTimeWithAggregatesFilter<"Image"> | Date | string
  }

  export type TenantIntegrationWhereInput = {
    AND?: TenantIntegrationWhereInput | TenantIntegrationWhereInput[]
    OR?: TenantIntegrationWhereInput[]
    NOT?: TenantIntegrationWhereInput | TenantIntegrationWhereInput[]
    id?: StringFilter<"TenantIntegration"> | string
    tenantId?: StringFilter<"TenantIntegration"> | string
    provider?: StringFilter<"TenantIntegration"> | string
    status?: StringFilter<"TenantIntegration"> | string
    credentials?: JsonFilter<"TenantIntegration">
    settings?: JsonFilter<"TenantIntegration">
    createdAt?: DateTimeFilter<"TenantIntegration"> | Date | string
    updatedAt?: DateTimeFilter<"TenantIntegration"> | Date | string
    tenant?: XOR<TenantScalarRelationFilter, TenantWhereInput>
  }

  export type TenantIntegrationOrderByWithRelationInput = {
    id?: SortOrder
    tenantId?: SortOrder
    provider?: SortOrder
    status?: SortOrder
    credentials?: SortOrder
    settings?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    tenant?: TenantOrderByWithRelationInput
    _relevance?: TenantIntegrationOrderByRelevanceInput
  }

  export type TenantIntegrationWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    tenantId_provider?: TenantIntegrationTenantIdProviderCompoundUniqueInput
    AND?: TenantIntegrationWhereInput | TenantIntegrationWhereInput[]
    OR?: TenantIntegrationWhereInput[]
    NOT?: TenantIntegrationWhereInput | TenantIntegrationWhereInput[]
    tenantId?: StringFilter<"TenantIntegration"> | string
    provider?: StringFilter<"TenantIntegration"> | string
    status?: StringFilter<"TenantIntegration"> | string
    credentials?: JsonFilter<"TenantIntegration">
    settings?: JsonFilter<"TenantIntegration">
    createdAt?: DateTimeFilter<"TenantIntegration"> | Date | string
    updatedAt?: DateTimeFilter<"TenantIntegration"> | Date | string
    tenant?: XOR<TenantScalarRelationFilter, TenantWhereInput>
  }, "id" | "tenantId_provider">

  export type TenantIntegrationOrderByWithAggregationInput = {
    id?: SortOrder
    tenantId?: SortOrder
    provider?: SortOrder
    status?: SortOrder
    credentials?: SortOrder
    settings?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: TenantIntegrationCountOrderByAggregateInput
    _max?: TenantIntegrationMaxOrderByAggregateInput
    _min?: TenantIntegrationMinOrderByAggregateInput
  }

  export type TenantIntegrationScalarWhereWithAggregatesInput = {
    AND?: TenantIntegrationScalarWhereWithAggregatesInput | TenantIntegrationScalarWhereWithAggregatesInput[]
    OR?: TenantIntegrationScalarWhereWithAggregatesInput[]
    NOT?: TenantIntegrationScalarWhereWithAggregatesInput | TenantIntegrationScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"TenantIntegration"> | string
    tenantId?: StringWithAggregatesFilter<"TenantIntegration"> | string
    provider?: StringWithAggregatesFilter<"TenantIntegration"> | string
    status?: StringWithAggregatesFilter<"TenantIntegration"> | string
    credentials?: JsonWithAggregatesFilter<"TenantIntegration">
    settings?: JsonWithAggregatesFilter<"TenantIntegration">
    createdAt?: DateTimeWithAggregatesFilter<"TenantIntegration"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"TenantIntegration"> | Date | string
  }

  export type TenantCreateInput = {
    id?: string
    databaseName: string
    databaseUrl: string
    name?: string
    status?: string
    logoUrl?: string | null
    modulos?: NullableJsonNullValueInput | InputJsonValue
    razaoSocial?: string | null
    nomeFantasia?: string | null
    cnpj?: string | null
    ie?: string | null
    im?: string | null
    crt?: number
    logradouro?: string | null
    numero?: string | null
    complemento?: string | null
    bairro?: string | null
    municipio?: string | null
    codMunicipio?: string | null
    uf?: string | null
    cep?: string | null
    telefone?: string | null
    emailContador?: string | null
    nfceAtivo?: boolean
    nfceAutoSync?: boolean
    nfceSerie?: number
    nfceAmbiente?: number
    nfceCsc?: string | null
    nfceIdCsc?: string | null
    certPfx?: Bytes | null
    certSenha?: string | null
    certValidade?: Date | string | null
    cosmosApiKey?: string | null
    mensalidadeValor?: Decimal | DecimalJsLike | number | string | null
    mensalidadeVencimento?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    termsAcceptedAt?: Date | string | null
    users?: UserCreateNestedManyWithoutTenantInput
    tenantIntegrations?: TenantIntegrationCreateNestedManyWithoutTenantInput
  }

  export type TenantUncheckedCreateInput = {
    id?: string
    databaseName: string
    databaseUrl: string
    name?: string
    status?: string
    logoUrl?: string | null
    modulos?: NullableJsonNullValueInput | InputJsonValue
    razaoSocial?: string | null
    nomeFantasia?: string | null
    cnpj?: string | null
    ie?: string | null
    im?: string | null
    crt?: number
    logradouro?: string | null
    numero?: string | null
    complemento?: string | null
    bairro?: string | null
    municipio?: string | null
    codMunicipio?: string | null
    uf?: string | null
    cep?: string | null
    telefone?: string | null
    emailContador?: string | null
    nfceAtivo?: boolean
    nfceAutoSync?: boolean
    nfceSerie?: number
    nfceAmbiente?: number
    nfceCsc?: string | null
    nfceIdCsc?: string | null
    certPfx?: Bytes | null
    certSenha?: string | null
    certValidade?: Date | string | null
    cosmosApiKey?: string | null
    mensalidadeValor?: Decimal | DecimalJsLike | number | string | null
    mensalidadeVencimento?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    termsAcceptedAt?: Date | string | null
    users?: UserUncheckedCreateNestedManyWithoutTenantInput
    tenantIntegrations?: TenantIntegrationUncheckedCreateNestedManyWithoutTenantInput
  }

  export type TenantUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    databaseName?: StringFieldUpdateOperationsInput | string
    databaseUrl?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    logoUrl?: NullableStringFieldUpdateOperationsInput | string | null
    modulos?: NullableJsonNullValueInput | InputJsonValue
    razaoSocial?: NullableStringFieldUpdateOperationsInput | string | null
    nomeFantasia?: NullableStringFieldUpdateOperationsInput | string | null
    cnpj?: NullableStringFieldUpdateOperationsInput | string | null
    ie?: NullableStringFieldUpdateOperationsInput | string | null
    im?: NullableStringFieldUpdateOperationsInput | string | null
    crt?: IntFieldUpdateOperationsInput | number
    logradouro?: NullableStringFieldUpdateOperationsInput | string | null
    numero?: NullableStringFieldUpdateOperationsInput | string | null
    complemento?: NullableStringFieldUpdateOperationsInput | string | null
    bairro?: NullableStringFieldUpdateOperationsInput | string | null
    municipio?: NullableStringFieldUpdateOperationsInput | string | null
    codMunicipio?: NullableStringFieldUpdateOperationsInput | string | null
    uf?: NullableStringFieldUpdateOperationsInput | string | null
    cep?: NullableStringFieldUpdateOperationsInput | string | null
    telefone?: NullableStringFieldUpdateOperationsInput | string | null
    emailContador?: NullableStringFieldUpdateOperationsInput | string | null
    nfceAtivo?: BoolFieldUpdateOperationsInput | boolean
    nfceAutoSync?: BoolFieldUpdateOperationsInput | boolean
    nfceSerie?: IntFieldUpdateOperationsInput | number
    nfceAmbiente?: IntFieldUpdateOperationsInput | number
    nfceCsc?: NullableStringFieldUpdateOperationsInput | string | null
    nfceIdCsc?: NullableStringFieldUpdateOperationsInput | string | null
    certPfx?: NullableBytesFieldUpdateOperationsInput | Bytes | null
    certSenha?: NullableStringFieldUpdateOperationsInput | string | null
    certValidade?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    cosmosApiKey?: NullableStringFieldUpdateOperationsInput | string | null
    mensalidadeValor?: NullableDecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string | null
    mensalidadeVencimento?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    termsAcceptedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    users?: UserUpdateManyWithoutTenantNestedInput
    tenantIntegrations?: TenantIntegrationUpdateManyWithoutTenantNestedInput
  }

  export type TenantUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    databaseName?: StringFieldUpdateOperationsInput | string
    databaseUrl?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    logoUrl?: NullableStringFieldUpdateOperationsInput | string | null
    modulos?: NullableJsonNullValueInput | InputJsonValue
    razaoSocial?: NullableStringFieldUpdateOperationsInput | string | null
    nomeFantasia?: NullableStringFieldUpdateOperationsInput | string | null
    cnpj?: NullableStringFieldUpdateOperationsInput | string | null
    ie?: NullableStringFieldUpdateOperationsInput | string | null
    im?: NullableStringFieldUpdateOperationsInput | string | null
    crt?: IntFieldUpdateOperationsInput | number
    logradouro?: NullableStringFieldUpdateOperationsInput | string | null
    numero?: NullableStringFieldUpdateOperationsInput | string | null
    complemento?: NullableStringFieldUpdateOperationsInput | string | null
    bairro?: NullableStringFieldUpdateOperationsInput | string | null
    municipio?: NullableStringFieldUpdateOperationsInput | string | null
    codMunicipio?: NullableStringFieldUpdateOperationsInput | string | null
    uf?: NullableStringFieldUpdateOperationsInput | string | null
    cep?: NullableStringFieldUpdateOperationsInput | string | null
    telefone?: NullableStringFieldUpdateOperationsInput | string | null
    emailContador?: NullableStringFieldUpdateOperationsInput | string | null
    nfceAtivo?: BoolFieldUpdateOperationsInput | boolean
    nfceAutoSync?: BoolFieldUpdateOperationsInput | boolean
    nfceSerie?: IntFieldUpdateOperationsInput | number
    nfceAmbiente?: IntFieldUpdateOperationsInput | number
    nfceCsc?: NullableStringFieldUpdateOperationsInput | string | null
    nfceIdCsc?: NullableStringFieldUpdateOperationsInput | string | null
    certPfx?: NullableBytesFieldUpdateOperationsInput | Bytes | null
    certSenha?: NullableStringFieldUpdateOperationsInput | string | null
    certValidade?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    cosmosApiKey?: NullableStringFieldUpdateOperationsInput | string | null
    mensalidadeValor?: NullableDecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string | null
    mensalidadeVencimento?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    termsAcceptedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    users?: UserUncheckedUpdateManyWithoutTenantNestedInput
    tenantIntegrations?: TenantIntegrationUncheckedUpdateManyWithoutTenantNestedInput
  }

  export type TenantCreateManyInput = {
    id?: string
    databaseName: string
    databaseUrl: string
    name?: string
    status?: string
    logoUrl?: string | null
    modulos?: NullableJsonNullValueInput | InputJsonValue
    razaoSocial?: string | null
    nomeFantasia?: string | null
    cnpj?: string | null
    ie?: string | null
    im?: string | null
    crt?: number
    logradouro?: string | null
    numero?: string | null
    complemento?: string | null
    bairro?: string | null
    municipio?: string | null
    codMunicipio?: string | null
    uf?: string | null
    cep?: string | null
    telefone?: string | null
    emailContador?: string | null
    nfceAtivo?: boolean
    nfceAutoSync?: boolean
    nfceSerie?: number
    nfceAmbiente?: number
    nfceCsc?: string | null
    nfceIdCsc?: string | null
    certPfx?: Bytes | null
    certSenha?: string | null
    certValidade?: Date | string | null
    cosmosApiKey?: string | null
    mensalidadeValor?: Decimal | DecimalJsLike | number | string | null
    mensalidadeVencimento?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    termsAcceptedAt?: Date | string | null
  }

  export type TenantUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    databaseName?: StringFieldUpdateOperationsInput | string
    databaseUrl?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    logoUrl?: NullableStringFieldUpdateOperationsInput | string | null
    modulos?: NullableJsonNullValueInput | InputJsonValue
    razaoSocial?: NullableStringFieldUpdateOperationsInput | string | null
    nomeFantasia?: NullableStringFieldUpdateOperationsInput | string | null
    cnpj?: NullableStringFieldUpdateOperationsInput | string | null
    ie?: NullableStringFieldUpdateOperationsInput | string | null
    im?: NullableStringFieldUpdateOperationsInput | string | null
    crt?: IntFieldUpdateOperationsInput | number
    logradouro?: NullableStringFieldUpdateOperationsInput | string | null
    numero?: NullableStringFieldUpdateOperationsInput | string | null
    complemento?: NullableStringFieldUpdateOperationsInput | string | null
    bairro?: NullableStringFieldUpdateOperationsInput | string | null
    municipio?: NullableStringFieldUpdateOperationsInput | string | null
    codMunicipio?: NullableStringFieldUpdateOperationsInput | string | null
    uf?: NullableStringFieldUpdateOperationsInput | string | null
    cep?: NullableStringFieldUpdateOperationsInput | string | null
    telefone?: NullableStringFieldUpdateOperationsInput | string | null
    emailContador?: NullableStringFieldUpdateOperationsInput | string | null
    nfceAtivo?: BoolFieldUpdateOperationsInput | boolean
    nfceAutoSync?: BoolFieldUpdateOperationsInput | boolean
    nfceSerie?: IntFieldUpdateOperationsInput | number
    nfceAmbiente?: IntFieldUpdateOperationsInput | number
    nfceCsc?: NullableStringFieldUpdateOperationsInput | string | null
    nfceIdCsc?: NullableStringFieldUpdateOperationsInput | string | null
    certPfx?: NullableBytesFieldUpdateOperationsInput | Bytes | null
    certSenha?: NullableStringFieldUpdateOperationsInput | string | null
    certValidade?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    cosmosApiKey?: NullableStringFieldUpdateOperationsInput | string | null
    mensalidadeValor?: NullableDecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string | null
    mensalidadeVencimento?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    termsAcceptedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type TenantUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    databaseName?: StringFieldUpdateOperationsInput | string
    databaseUrl?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    logoUrl?: NullableStringFieldUpdateOperationsInput | string | null
    modulos?: NullableJsonNullValueInput | InputJsonValue
    razaoSocial?: NullableStringFieldUpdateOperationsInput | string | null
    nomeFantasia?: NullableStringFieldUpdateOperationsInput | string | null
    cnpj?: NullableStringFieldUpdateOperationsInput | string | null
    ie?: NullableStringFieldUpdateOperationsInput | string | null
    im?: NullableStringFieldUpdateOperationsInput | string | null
    crt?: IntFieldUpdateOperationsInput | number
    logradouro?: NullableStringFieldUpdateOperationsInput | string | null
    numero?: NullableStringFieldUpdateOperationsInput | string | null
    complemento?: NullableStringFieldUpdateOperationsInput | string | null
    bairro?: NullableStringFieldUpdateOperationsInput | string | null
    municipio?: NullableStringFieldUpdateOperationsInput | string | null
    codMunicipio?: NullableStringFieldUpdateOperationsInput | string | null
    uf?: NullableStringFieldUpdateOperationsInput | string | null
    cep?: NullableStringFieldUpdateOperationsInput | string | null
    telefone?: NullableStringFieldUpdateOperationsInput | string | null
    emailContador?: NullableStringFieldUpdateOperationsInput | string | null
    nfceAtivo?: BoolFieldUpdateOperationsInput | boolean
    nfceAutoSync?: BoolFieldUpdateOperationsInput | boolean
    nfceSerie?: IntFieldUpdateOperationsInput | number
    nfceAmbiente?: IntFieldUpdateOperationsInput | number
    nfceCsc?: NullableStringFieldUpdateOperationsInput | string | null
    nfceIdCsc?: NullableStringFieldUpdateOperationsInput | string | null
    certPfx?: NullableBytesFieldUpdateOperationsInput | Bytes | null
    certSenha?: NullableStringFieldUpdateOperationsInput | string | null
    certValidade?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    cosmosApiKey?: NullableStringFieldUpdateOperationsInput | string | null
    mensalidadeValor?: NullableDecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string | null
    mensalidadeVencimento?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    termsAcceptedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type UserCreateInput = {
    id?: string
    name: string
    email: string
    password: string
    role?: string
    pin?: string | null
    active?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    tenant: TenantCreateNestedOneWithoutUsersInput
  }

  export type UserUncheckedCreateInput = {
    id?: string
    tenantId: string
    name: string
    email: string
    password: string
    role?: string
    pin?: string | null
    active?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type UserUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    password?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    pin?: NullableStringFieldUpdateOperationsInput | string | null
    active?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    tenant?: TenantUpdateOneRequiredWithoutUsersNestedInput
  }

  export type UserUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    password?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    pin?: NullableStringFieldUpdateOperationsInput | string | null
    active?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type UserCreateManyInput = {
    id?: string
    tenantId: string
    name: string
    email: string
    password: string
    role?: string
    pin?: string | null
    active?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type UserUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    password?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    pin?: NullableStringFieldUpdateOperationsInput | string | null
    active?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type UserUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    password?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    pin?: NullableStringFieldUpdateOperationsInput | string | null
    active?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type MasterProductCreateInput = {
    id?: string
    ean: string
    name: string
    brand?: string | null
    ncm?: string | null
    cest?: string | null
    unit?: string
    imageUrl?: string | null
    category?: string | null
    source?: string
    createdAt?: Date | string
  }

  export type MasterProductUncheckedCreateInput = {
    id?: string
    ean: string
    name: string
    brand?: string | null
    ncm?: string | null
    cest?: string | null
    unit?: string
    imageUrl?: string | null
    category?: string | null
    source?: string
    createdAt?: Date | string
  }

  export type MasterProductUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    ean?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    brand?: NullableStringFieldUpdateOperationsInput | string | null
    ncm?: NullableStringFieldUpdateOperationsInput | string | null
    cest?: NullableStringFieldUpdateOperationsInput | string | null
    unit?: StringFieldUpdateOperationsInput | string
    imageUrl?: NullableStringFieldUpdateOperationsInput | string | null
    category?: NullableStringFieldUpdateOperationsInput | string | null
    source?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type MasterProductUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    ean?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    brand?: NullableStringFieldUpdateOperationsInput | string | null
    ncm?: NullableStringFieldUpdateOperationsInput | string | null
    cest?: NullableStringFieldUpdateOperationsInput | string | null
    unit?: StringFieldUpdateOperationsInput | string
    imageUrl?: NullableStringFieldUpdateOperationsInput | string | null
    category?: NullableStringFieldUpdateOperationsInput | string | null
    source?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type MasterProductCreateManyInput = {
    id?: string
    ean: string
    name: string
    brand?: string | null
    ncm?: string | null
    cest?: string | null
    unit?: string
    imageUrl?: string | null
    category?: string | null
    source?: string
    createdAt?: Date | string
  }

  export type MasterProductUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    ean?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    brand?: NullableStringFieldUpdateOperationsInput | string | null
    ncm?: NullableStringFieldUpdateOperationsInput | string | null
    cest?: NullableStringFieldUpdateOperationsInput | string | null
    unit?: StringFieldUpdateOperationsInput | string
    imageUrl?: NullableStringFieldUpdateOperationsInput | string | null
    category?: NullableStringFieldUpdateOperationsInput | string | null
    source?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type MasterProductUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    ean?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    brand?: NullableStringFieldUpdateOperationsInput | string | null
    ncm?: NullableStringFieldUpdateOperationsInput | string | null
    cest?: NullableStringFieldUpdateOperationsInput | string | null
    unit?: StringFieldUpdateOperationsInput | string
    imageUrl?: NullableStringFieldUpdateOperationsInput | string | null
    category?: NullableStringFieldUpdateOperationsInput | string | null
    source?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ImageCreateInput = {
    id?: string
    data: Bytes
    mimeType: string
    createdAt?: Date | string
  }

  export type ImageUncheckedCreateInput = {
    id?: string
    data: Bytes
    mimeType: string
    createdAt?: Date | string
  }

  export type ImageUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    data?: BytesFieldUpdateOperationsInput | Bytes
    mimeType?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ImageUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    data?: BytesFieldUpdateOperationsInput | Bytes
    mimeType?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ImageCreateManyInput = {
    id?: string
    data: Bytes
    mimeType: string
    createdAt?: Date | string
  }

  export type ImageUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    data?: BytesFieldUpdateOperationsInput | Bytes
    mimeType?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ImageUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    data?: BytesFieldUpdateOperationsInput | Bytes
    mimeType?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type TenantIntegrationCreateInput = {
    id?: string
    provider: string
    status?: string
    credentials: JsonNullValueInput | InputJsonValue
    settings: JsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
    tenant: TenantCreateNestedOneWithoutTenantIntegrationsInput
  }

  export type TenantIntegrationUncheckedCreateInput = {
    id?: string
    tenantId: string
    provider: string
    status?: string
    credentials: JsonNullValueInput | InputJsonValue
    settings: JsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type TenantIntegrationUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    provider?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    credentials?: JsonNullValueInput | InputJsonValue
    settings?: JsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    tenant?: TenantUpdateOneRequiredWithoutTenantIntegrationsNestedInput
  }

  export type TenantIntegrationUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    provider?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    credentials?: JsonNullValueInput | InputJsonValue
    settings?: JsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type TenantIntegrationCreateManyInput = {
    id?: string
    tenantId: string
    provider: string
    status?: string
    credentials: JsonNullValueInput | InputJsonValue
    settings: JsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type TenantIntegrationUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    provider?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    credentials?: JsonNullValueInput | InputJsonValue
    settings?: JsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type TenantIntegrationUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    tenantId?: StringFieldUpdateOperationsInput | string
    provider?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    credentials?: JsonNullValueInput | InputJsonValue
    settings?: JsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type StringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[]
    notIn?: string[]
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    search?: string
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type StringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | null
    notIn?: string[] | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    search?: string
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }
  export type JsonNullableFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<JsonNullableFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonNullableFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonNullableFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonNullableFilterBase<$PrismaModel>>, 'path'>>

  export type JsonNullableFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue
    lte?: InputJsonValue
    gt?: InputJsonValue
    gte?: InputJsonValue
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type IntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type BoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }

  export type BytesNullableFilter<$PrismaModel = never> = {
    equals?: Bytes | BytesFieldRefInput<$PrismaModel> | null
    in?: Bytes[] | null
    notIn?: Bytes[] | null
    not?: NestedBytesNullableFilter<$PrismaModel> | Bytes | null
  }

  export type DateTimeNullableFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | null
    notIn?: Date[] | string[] | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableFilter<$PrismaModel> | Date | string | null
  }

  export type DecimalNullableFilter<$PrismaModel = never> = {
    equals?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel> | null
    in?: Decimal[] | DecimalJsLike[] | number[] | string[] | null
    notIn?: Decimal[] | DecimalJsLike[] | number[] | string[] | null
    lt?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    lte?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    gt?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    gte?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    not?: NestedDecimalNullableFilter<$PrismaModel> | Decimal | DecimalJsLike | number | string | null
  }

  export type DateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[]
    notIn?: Date[] | string[]
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type UserListRelationFilter = {
    every?: UserWhereInput
    some?: UserWhereInput
    none?: UserWhereInput
  }

  export type TenantIntegrationListRelationFilter = {
    every?: TenantIntegrationWhereInput
    some?: TenantIntegrationWhereInput
    none?: TenantIntegrationWhereInput
  }

  export type SortOrderInput = {
    sort: SortOrder
    nulls?: NullsOrder
  }

  export type UserOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type TenantIntegrationOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type TenantOrderByRelevanceInput = {
    fields: TenantOrderByRelevanceFieldEnum | TenantOrderByRelevanceFieldEnum[]
    sort: SortOrder
    search: string
  }

  export type TenantCountOrderByAggregateInput = {
    id?: SortOrder
    databaseName?: SortOrder
    databaseUrl?: SortOrder
    name?: SortOrder
    status?: SortOrder
    logoUrl?: SortOrder
    modulos?: SortOrder
    razaoSocial?: SortOrder
    nomeFantasia?: SortOrder
    cnpj?: SortOrder
    ie?: SortOrder
    im?: SortOrder
    crt?: SortOrder
    logradouro?: SortOrder
    numero?: SortOrder
    complemento?: SortOrder
    bairro?: SortOrder
    municipio?: SortOrder
    codMunicipio?: SortOrder
    uf?: SortOrder
    cep?: SortOrder
    telefone?: SortOrder
    emailContador?: SortOrder
    nfceAtivo?: SortOrder
    nfceAutoSync?: SortOrder
    nfceSerie?: SortOrder
    nfceAmbiente?: SortOrder
    nfceCsc?: SortOrder
    nfceIdCsc?: SortOrder
    certPfx?: SortOrder
    certSenha?: SortOrder
    certValidade?: SortOrder
    cosmosApiKey?: SortOrder
    mensalidadeValor?: SortOrder
    mensalidadeVencimento?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    termsAcceptedAt?: SortOrder
  }

  export type TenantAvgOrderByAggregateInput = {
    crt?: SortOrder
    nfceSerie?: SortOrder
    nfceAmbiente?: SortOrder
    mensalidadeValor?: SortOrder
  }

  export type TenantMaxOrderByAggregateInput = {
    id?: SortOrder
    databaseName?: SortOrder
    databaseUrl?: SortOrder
    name?: SortOrder
    status?: SortOrder
    logoUrl?: SortOrder
    razaoSocial?: SortOrder
    nomeFantasia?: SortOrder
    cnpj?: SortOrder
    ie?: SortOrder
    im?: SortOrder
    crt?: SortOrder
    logradouro?: SortOrder
    numero?: SortOrder
    complemento?: SortOrder
    bairro?: SortOrder
    municipio?: SortOrder
    codMunicipio?: SortOrder
    uf?: SortOrder
    cep?: SortOrder
    telefone?: SortOrder
    emailContador?: SortOrder
    nfceAtivo?: SortOrder
    nfceAutoSync?: SortOrder
    nfceSerie?: SortOrder
    nfceAmbiente?: SortOrder
    nfceCsc?: SortOrder
    nfceIdCsc?: SortOrder
    certPfx?: SortOrder
    certSenha?: SortOrder
    certValidade?: SortOrder
    cosmosApiKey?: SortOrder
    mensalidadeValor?: SortOrder
    mensalidadeVencimento?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    termsAcceptedAt?: SortOrder
  }

  export type TenantMinOrderByAggregateInput = {
    id?: SortOrder
    databaseName?: SortOrder
    databaseUrl?: SortOrder
    name?: SortOrder
    status?: SortOrder
    logoUrl?: SortOrder
    razaoSocial?: SortOrder
    nomeFantasia?: SortOrder
    cnpj?: SortOrder
    ie?: SortOrder
    im?: SortOrder
    crt?: SortOrder
    logradouro?: SortOrder
    numero?: SortOrder
    complemento?: SortOrder
    bairro?: SortOrder
    municipio?: SortOrder
    codMunicipio?: SortOrder
    uf?: SortOrder
    cep?: SortOrder
    telefone?: SortOrder
    emailContador?: SortOrder
    nfceAtivo?: SortOrder
    nfceAutoSync?: SortOrder
    nfceSerie?: SortOrder
    nfceAmbiente?: SortOrder
    nfceCsc?: SortOrder
    nfceIdCsc?: SortOrder
    certPfx?: SortOrder
    certSenha?: SortOrder
    certValidade?: SortOrder
    cosmosApiKey?: SortOrder
    mensalidadeValor?: SortOrder
    mensalidadeVencimento?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    termsAcceptedAt?: SortOrder
  }

  export type TenantSumOrderByAggregateInput = {
    crt?: SortOrder
    nfceSerie?: SortOrder
    nfceAmbiente?: SortOrder
    mensalidadeValor?: SortOrder
  }

  export type StringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[]
    notIn?: string[]
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    search?: string
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type StringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | null
    notIn?: string[] | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    search?: string
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }
  export type JsonNullableWithAggregatesFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>, 'path'>>

  export type JsonNullableWithAggregatesFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue
    lte?: InputJsonValue
    gt?: InputJsonValue
    gte?: InputJsonValue
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedJsonNullableFilter<$PrismaModel>
    _max?: NestedJsonNullableFilter<$PrismaModel>
  }

  export type IntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type BoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }

  export type BytesNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Bytes | BytesFieldRefInput<$PrismaModel> | null
    in?: Bytes[] | null
    notIn?: Bytes[] | null
    not?: NestedBytesNullableWithAggregatesFilter<$PrismaModel> | Bytes | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedBytesNullableFilter<$PrismaModel>
    _max?: NestedBytesNullableFilter<$PrismaModel>
  }

  export type DateTimeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | null
    notIn?: Date[] | string[] | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableWithAggregatesFilter<$PrismaModel> | Date | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedDateTimeNullableFilter<$PrismaModel>
    _max?: NestedDateTimeNullableFilter<$PrismaModel>
  }

  export type DecimalNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel> | null
    in?: Decimal[] | DecimalJsLike[] | number[] | string[] | null
    notIn?: Decimal[] | DecimalJsLike[] | number[] | string[] | null
    lt?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    lte?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    gt?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    gte?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    not?: NestedDecimalNullableWithAggregatesFilter<$PrismaModel> | Decimal | DecimalJsLike | number | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _avg?: NestedDecimalNullableFilter<$PrismaModel>
    _sum?: NestedDecimalNullableFilter<$PrismaModel>
    _min?: NestedDecimalNullableFilter<$PrismaModel>
    _max?: NestedDecimalNullableFilter<$PrismaModel>
  }

  export type DateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[]
    notIn?: Date[] | string[]
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type TenantScalarRelationFilter = {
    is?: TenantWhereInput
    isNot?: TenantWhereInput
  }

  export type UserOrderByRelevanceInput = {
    fields: UserOrderByRelevanceFieldEnum | UserOrderByRelevanceFieldEnum[]
    sort: SortOrder
    search: string
  }

  export type UserCountOrderByAggregateInput = {
    id?: SortOrder
    tenantId?: SortOrder
    name?: SortOrder
    email?: SortOrder
    password?: SortOrder
    role?: SortOrder
    pin?: SortOrder
    active?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type UserMaxOrderByAggregateInput = {
    id?: SortOrder
    tenantId?: SortOrder
    name?: SortOrder
    email?: SortOrder
    password?: SortOrder
    role?: SortOrder
    pin?: SortOrder
    active?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type UserMinOrderByAggregateInput = {
    id?: SortOrder
    tenantId?: SortOrder
    name?: SortOrder
    email?: SortOrder
    password?: SortOrder
    role?: SortOrder
    pin?: SortOrder
    active?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type MasterProductOrderByRelevanceInput = {
    fields: MasterProductOrderByRelevanceFieldEnum | MasterProductOrderByRelevanceFieldEnum[]
    sort: SortOrder
    search: string
  }

  export type MasterProductCountOrderByAggregateInput = {
    id?: SortOrder
    ean?: SortOrder
    name?: SortOrder
    brand?: SortOrder
    ncm?: SortOrder
    cest?: SortOrder
    unit?: SortOrder
    imageUrl?: SortOrder
    category?: SortOrder
    source?: SortOrder
    createdAt?: SortOrder
  }

  export type MasterProductMaxOrderByAggregateInput = {
    id?: SortOrder
    ean?: SortOrder
    name?: SortOrder
    brand?: SortOrder
    ncm?: SortOrder
    cest?: SortOrder
    unit?: SortOrder
    imageUrl?: SortOrder
    category?: SortOrder
    source?: SortOrder
    createdAt?: SortOrder
  }

  export type MasterProductMinOrderByAggregateInput = {
    id?: SortOrder
    ean?: SortOrder
    name?: SortOrder
    brand?: SortOrder
    ncm?: SortOrder
    cest?: SortOrder
    unit?: SortOrder
    imageUrl?: SortOrder
    category?: SortOrder
    source?: SortOrder
    createdAt?: SortOrder
  }

  export type BytesFilter<$PrismaModel = never> = {
    equals?: Bytes | BytesFieldRefInput<$PrismaModel>
    in?: Bytes[]
    notIn?: Bytes[]
    not?: NestedBytesFilter<$PrismaModel> | Bytes
  }

  export type ImageOrderByRelevanceInput = {
    fields: ImageOrderByRelevanceFieldEnum | ImageOrderByRelevanceFieldEnum[]
    sort: SortOrder
    search: string
  }

  export type ImageCountOrderByAggregateInput = {
    id?: SortOrder
    data?: SortOrder
    mimeType?: SortOrder
    createdAt?: SortOrder
  }

  export type ImageMaxOrderByAggregateInput = {
    id?: SortOrder
    data?: SortOrder
    mimeType?: SortOrder
    createdAt?: SortOrder
  }

  export type ImageMinOrderByAggregateInput = {
    id?: SortOrder
    data?: SortOrder
    mimeType?: SortOrder
    createdAt?: SortOrder
  }

  export type BytesWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Bytes | BytesFieldRefInput<$PrismaModel>
    in?: Bytes[]
    notIn?: Bytes[]
    not?: NestedBytesWithAggregatesFilter<$PrismaModel> | Bytes
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBytesFilter<$PrismaModel>
    _max?: NestedBytesFilter<$PrismaModel>
  }
  export type JsonFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<JsonFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonFilterBase<$PrismaModel>>, 'path'>>

  export type JsonFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue
    lte?: InputJsonValue
    gt?: InputJsonValue
    gte?: InputJsonValue
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type TenantIntegrationOrderByRelevanceInput = {
    fields: TenantIntegrationOrderByRelevanceFieldEnum | TenantIntegrationOrderByRelevanceFieldEnum[]
    sort: SortOrder
    search: string
  }

  export type TenantIntegrationTenantIdProviderCompoundUniqueInput = {
    tenantId: string
    provider: string
  }

  export type TenantIntegrationCountOrderByAggregateInput = {
    id?: SortOrder
    tenantId?: SortOrder
    provider?: SortOrder
    status?: SortOrder
    credentials?: SortOrder
    settings?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type TenantIntegrationMaxOrderByAggregateInput = {
    id?: SortOrder
    tenantId?: SortOrder
    provider?: SortOrder
    status?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type TenantIntegrationMinOrderByAggregateInput = {
    id?: SortOrder
    tenantId?: SortOrder
    provider?: SortOrder
    status?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }
  export type JsonWithAggregatesFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<JsonWithAggregatesFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonWithAggregatesFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonWithAggregatesFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonWithAggregatesFilterBase<$PrismaModel>>, 'path'>>

  export type JsonWithAggregatesFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue
    lte?: InputJsonValue
    gt?: InputJsonValue
    gte?: InputJsonValue
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedJsonFilter<$PrismaModel>
    _max?: NestedJsonFilter<$PrismaModel>
  }

  export type UserCreateNestedManyWithoutTenantInput = {
    create?: XOR<UserCreateWithoutTenantInput, UserUncheckedCreateWithoutTenantInput> | UserCreateWithoutTenantInput[] | UserUncheckedCreateWithoutTenantInput[]
    connectOrCreate?: UserCreateOrConnectWithoutTenantInput | UserCreateOrConnectWithoutTenantInput[]
    createMany?: UserCreateManyTenantInputEnvelope
    connect?: UserWhereUniqueInput | UserWhereUniqueInput[]
  }

  export type TenantIntegrationCreateNestedManyWithoutTenantInput = {
    create?: XOR<TenantIntegrationCreateWithoutTenantInput, TenantIntegrationUncheckedCreateWithoutTenantInput> | TenantIntegrationCreateWithoutTenantInput[] | TenantIntegrationUncheckedCreateWithoutTenantInput[]
    connectOrCreate?: TenantIntegrationCreateOrConnectWithoutTenantInput | TenantIntegrationCreateOrConnectWithoutTenantInput[]
    createMany?: TenantIntegrationCreateManyTenantInputEnvelope
    connect?: TenantIntegrationWhereUniqueInput | TenantIntegrationWhereUniqueInput[]
  }

  export type UserUncheckedCreateNestedManyWithoutTenantInput = {
    create?: XOR<UserCreateWithoutTenantInput, UserUncheckedCreateWithoutTenantInput> | UserCreateWithoutTenantInput[] | UserUncheckedCreateWithoutTenantInput[]
    connectOrCreate?: UserCreateOrConnectWithoutTenantInput | UserCreateOrConnectWithoutTenantInput[]
    createMany?: UserCreateManyTenantInputEnvelope
    connect?: UserWhereUniqueInput | UserWhereUniqueInput[]
  }

  export type TenantIntegrationUncheckedCreateNestedManyWithoutTenantInput = {
    create?: XOR<TenantIntegrationCreateWithoutTenantInput, TenantIntegrationUncheckedCreateWithoutTenantInput> | TenantIntegrationCreateWithoutTenantInput[] | TenantIntegrationUncheckedCreateWithoutTenantInput[]
    connectOrCreate?: TenantIntegrationCreateOrConnectWithoutTenantInput | TenantIntegrationCreateOrConnectWithoutTenantInput[]
    createMany?: TenantIntegrationCreateManyTenantInputEnvelope
    connect?: TenantIntegrationWhereUniqueInput | TenantIntegrationWhereUniqueInput[]
  }

  export type StringFieldUpdateOperationsInput = {
    set?: string
  }

  export type NullableStringFieldUpdateOperationsInput = {
    set?: string | null
  }

  export type IntFieldUpdateOperationsInput = {
    set?: number
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type BoolFieldUpdateOperationsInput = {
    set?: boolean
  }

  export type NullableBytesFieldUpdateOperationsInput = {
    set?: Bytes | null
  }

  export type NullableDateTimeFieldUpdateOperationsInput = {
    set?: Date | string | null
  }

  export type NullableDecimalFieldUpdateOperationsInput = {
    set?: Decimal | DecimalJsLike | number | string | null
    increment?: Decimal | DecimalJsLike | number | string
    decrement?: Decimal | DecimalJsLike | number | string
    multiply?: Decimal | DecimalJsLike | number | string
    divide?: Decimal | DecimalJsLike | number | string
  }

  export type DateTimeFieldUpdateOperationsInput = {
    set?: Date | string
  }

  export type UserUpdateManyWithoutTenantNestedInput = {
    create?: XOR<UserCreateWithoutTenantInput, UserUncheckedCreateWithoutTenantInput> | UserCreateWithoutTenantInput[] | UserUncheckedCreateWithoutTenantInput[]
    connectOrCreate?: UserCreateOrConnectWithoutTenantInput | UserCreateOrConnectWithoutTenantInput[]
    upsert?: UserUpsertWithWhereUniqueWithoutTenantInput | UserUpsertWithWhereUniqueWithoutTenantInput[]
    createMany?: UserCreateManyTenantInputEnvelope
    set?: UserWhereUniqueInput | UserWhereUniqueInput[]
    disconnect?: UserWhereUniqueInput | UserWhereUniqueInput[]
    delete?: UserWhereUniqueInput | UserWhereUniqueInput[]
    connect?: UserWhereUniqueInput | UserWhereUniqueInput[]
    update?: UserUpdateWithWhereUniqueWithoutTenantInput | UserUpdateWithWhereUniqueWithoutTenantInput[]
    updateMany?: UserUpdateManyWithWhereWithoutTenantInput | UserUpdateManyWithWhereWithoutTenantInput[]
    deleteMany?: UserScalarWhereInput | UserScalarWhereInput[]
  }

  export type TenantIntegrationUpdateManyWithoutTenantNestedInput = {
    create?: XOR<TenantIntegrationCreateWithoutTenantInput, TenantIntegrationUncheckedCreateWithoutTenantInput> | TenantIntegrationCreateWithoutTenantInput[] | TenantIntegrationUncheckedCreateWithoutTenantInput[]
    connectOrCreate?: TenantIntegrationCreateOrConnectWithoutTenantInput | TenantIntegrationCreateOrConnectWithoutTenantInput[]
    upsert?: TenantIntegrationUpsertWithWhereUniqueWithoutTenantInput | TenantIntegrationUpsertWithWhereUniqueWithoutTenantInput[]
    createMany?: TenantIntegrationCreateManyTenantInputEnvelope
    set?: TenantIntegrationWhereUniqueInput | TenantIntegrationWhereUniqueInput[]
    disconnect?: TenantIntegrationWhereUniqueInput | TenantIntegrationWhereUniqueInput[]
    delete?: TenantIntegrationWhereUniqueInput | TenantIntegrationWhereUniqueInput[]
    connect?: TenantIntegrationWhereUniqueInput | TenantIntegrationWhereUniqueInput[]
    update?: TenantIntegrationUpdateWithWhereUniqueWithoutTenantInput | TenantIntegrationUpdateWithWhereUniqueWithoutTenantInput[]
    updateMany?: TenantIntegrationUpdateManyWithWhereWithoutTenantInput | TenantIntegrationUpdateManyWithWhereWithoutTenantInput[]
    deleteMany?: TenantIntegrationScalarWhereInput | TenantIntegrationScalarWhereInput[]
  }

  export type UserUncheckedUpdateManyWithoutTenantNestedInput = {
    create?: XOR<UserCreateWithoutTenantInput, UserUncheckedCreateWithoutTenantInput> | UserCreateWithoutTenantInput[] | UserUncheckedCreateWithoutTenantInput[]
    connectOrCreate?: UserCreateOrConnectWithoutTenantInput | UserCreateOrConnectWithoutTenantInput[]
    upsert?: UserUpsertWithWhereUniqueWithoutTenantInput | UserUpsertWithWhereUniqueWithoutTenantInput[]
    createMany?: UserCreateManyTenantInputEnvelope
    set?: UserWhereUniqueInput | UserWhereUniqueInput[]
    disconnect?: UserWhereUniqueInput | UserWhereUniqueInput[]
    delete?: UserWhereUniqueInput | UserWhereUniqueInput[]
    connect?: UserWhereUniqueInput | UserWhereUniqueInput[]
    update?: UserUpdateWithWhereUniqueWithoutTenantInput | UserUpdateWithWhereUniqueWithoutTenantInput[]
    updateMany?: UserUpdateManyWithWhereWithoutTenantInput | UserUpdateManyWithWhereWithoutTenantInput[]
    deleteMany?: UserScalarWhereInput | UserScalarWhereInput[]
  }

  export type TenantIntegrationUncheckedUpdateManyWithoutTenantNestedInput = {
    create?: XOR<TenantIntegrationCreateWithoutTenantInput, TenantIntegrationUncheckedCreateWithoutTenantInput> | TenantIntegrationCreateWithoutTenantInput[] | TenantIntegrationUncheckedCreateWithoutTenantInput[]
    connectOrCreate?: TenantIntegrationCreateOrConnectWithoutTenantInput | TenantIntegrationCreateOrConnectWithoutTenantInput[]
    upsert?: TenantIntegrationUpsertWithWhereUniqueWithoutTenantInput | TenantIntegrationUpsertWithWhereUniqueWithoutTenantInput[]
    createMany?: TenantIntegrationCreateManyTenantInputEnvelope
    set?: TenantIntegrationWhereUniqueInput | TenantIntegrationWhereUniqueInput[]
    disconnect?: TenantIntegrationWhereUniqueInput | TenantIntegrationWhereUniqueInput[]
    delete?: TenantIntegrationWhereUniqueInput | TenantIntegrationWhereUniqueInput[]
    connect?: TenantIntegrationWhereUniqueInput | TenantIntegrationWhereUniqueInput[]
    update?: TenantIntegrationUpdateWithWhereUniqueWithoutTenantInput | TenantIntegrationUpdateWithWhereUniqueWithoutTenantInput[]
    updateMany?: TenantIntegrationUpdateManyWithWhereWithoutTenantInput | TenantIntegrationUpdateManyWithWhereWithoutTenantInput[]
    deleteMany?: TenantIntegrationScalarWhereInput | TenantIntegrationScalarWhereInput[]
  }

  export type TenantCreateNestedOneWithoutUsersInput = {
    create?: XOR<TenantCreateWithoutUsersInput, TenantUncheckedCreateWithoutUsersInput>
    connectOrCreate?: TenantCreateOrConnectWithoutUsersInput
    connect?: TenantWhereUniqueInput
  }

  export type TenantUpdateOneRequiredWithoutUsersNestedInput = {
    create?: XOR<TenantCreateWithoutUsersInput, TenantUncheckedCreateWithoutUsersInput>
    connectOrCreate?: TenantCreateOrConnectWithoutUsersInput
    upsert?: TenantUpsertWithoutUsersInput
    connect?: TenantWhereUniqueInput
    update?: XOR<XOR<TenantUpdateToOneWithWhereWithoutUsersInput, TenantUpdateWithoutUsersInput>, TenantUncheckedUpdateWithoutUsersInput>
  }

  export type BytesFieldUpdateOperationsInput = {
    set?: Bytes
  }

  export type TenantCreateNestedOneWithoutTenantIntegrationsInput = {
    create?: XOR<TenantCreateWithoutTenantIntegrationsInput, TenantUncheckedCreateWithoutTenantIntegrationsInput>
    connectOrCreate?: TenantCreateOrConnectWithoutTenantIntegrationsInput
    connect?: TenantWhereUniqueInput
  }

  export type TenantUpdateOneRequiredWithoutTenantIntegrationsNestedInput = {
    create?: XOR<TenantCreateWithoutTenantIntegrationsInput, TenantUncheckedCreateWithoutTenantIntegrationsInput>
    connectOrCreate?: TenantCreateOrConnectWithoutTenantIntegrationsInput
    upsert?: TenantUpsertWithoutTenantIntegrationsInput
    connect?: TenantWhereUniqueInput
    update?: XOR<XOR<TenantUpdateToOneWithWhereWithoutTenantIntegrationsInput, TenantUpdateWithoutTenantIntegrationsInput>, TenantUncheckedUpdateWithoutTenantIntegrationsInput>
  }

  export type NestedStringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[]
    notIn?: string[]
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    search?: string
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type NestedStringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | null
    notIn?: string[] | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    search?: string
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type NestedIntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type NestedBoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }

  export type NestedBytesNullableFilter<$PrismaModel = never> = {
    equals?: Bytes | BytesFieldRefInput<$PrismaModel> | null
    in?: Bytes[] | null
    notIn?: Bytes[] | null
    not?: NestedBytesNullableFilter<$PrismaModel> | Bytes | null
  }

  export type NestedDateTimeNullableFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | null
    notIn?: Date[] | string[] | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableFilter<$PrismaModel> | Date | string | null
  }

  export type NestedDecimalNullableFilter<$PrismaModel = never> = {
    equals?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel> | null
    in?: Decimal[] | DecimalJsLike[] | number[] | string[] | null
    notIn?: Decimal[] | DecimalJsLike[] | number[] | string[] | null
    lt?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    lte?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    gt?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    gte?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    not?: NestedDecimalNullableFilter<$PrismaModel> | Decimal | DecimalJsLike | number | string | null
  }

  export type NestedDateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[]
    notIn?: Date[] | string[]
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type NestedStringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[]
    notIn?: string[]
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    search?: string
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type NestedStringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | null
    notIn?: string[] | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    search?: string
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type NestedIntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | null
    notIn?: number[] | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableFilter<$PrismaModel> | number | null
  }
  export type NestedJsonNullableFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<NestedJsonNullableFilterBase<$PrismaModel>>, Exclude<keyof Required<NestedJsonNullableFilterBase<$PrismaModel>>, 'path'>>,
        Required<NestedJsonNullableFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<NestedJsonNullableFilterBase<$PrismaModel>>, 'path'>>

  export type NestedJsonNullableFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue
    lte?: InputJsonValue
    gt?: InputJsonValue
    gte?: InputJsonValue
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type NestedIntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type NestedFloatFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatFilter<$PrismaModel> | number
  }

  export type NestedBoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }

  export type NestedBytesNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Bytes | BytesFieldRefInput<$PrismaModel> | null
    in?: Bytes[] | null
    notIn?: Bytes[] | null
    not?: NestedBytesNullableWithAggregatesFilter<$PrismaModel> | Bytes | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedBytesNullableFilter<$PrismaModel>
    _max?: NestedBytesNullableFilter<$PrismaModel>
  }

  export type NestedDateTimeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | null
    notIn?: Date[] | string[] | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableWithAggregatesFilter<$PrismaModel> | Date | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedDateTimeNullableFilter<$PrismaModel>
    _max?: NestedDateTimeNullableFilter<$PrismaModel>
  }

  export type NestedDecimalNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel> | null
    in?: Decimal[] | DecimalJsLike[] | number[] | string[] | null
    notIn?: Decimal[] | DecimalJsLike[] | number[] | string[] | null
    lt?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    lte?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    gt?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    gte?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    not?: NestedDecimalNullableWithAggregatesFilter<$PrismaModel> | Decimal | DecimalJsLike | number | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _avg?: NestedDecimalNullableFilter<$PrismaModel>
    _sum?: NestedDecimalNullableFilter<$PrismaModel>
    _min?: NestedDecimalNullableFilter<$PrismaModel>
    _max?: NestedDecimalNullableFilter<$PrismaModel>
  }

  export type NestedDateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[]
    notIn?: Date[] | string[]
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type NestedBytesFilter<$PrismaModel = never> = {
    equals?: Bytes | BytesFieldRefInput<$PrismaModel>
    in?: Bytes[]
    notIn?: Bytes[]
    not?: NestedBytesFilter<$PrismaModel> | Bytes
  }

  export type NestedBytesWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Bytes | BytesFieldRefInput<$PrismaModel>
    in?: Bytes[]
    notIn?: Bytes[]
    not?: NestedBytesWithAggregatesFilter<$PrismaModel> | Bytes
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBytesFilter<$PrismaModel>
    _max?: NestedBytesFilter<$PrismaModel>
  }
  export type NestedJsonFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<NestedJsonFilterBase<$PrismaModel>>, Exclude<keyof Required<NestedJsonFilterBase<$PrismaModel>>, 'path'>>,
        Required<NestedJsonFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<NestedJsonFilterBase<$PrismaModel>>, 'path'>>

  export type NestedJsonFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue
    lte?: InputJsonValue
    gt?: InputJsonValue
    gte?: InputJsonValue
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type UserCreateWithoutTenantInput = {
    id?: string
    name: string
    email: string
    password: string
    role?: string
    pin?: string | null
    active?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type UserUncheckedCreateWithoutTenantInput = {
    id?: string
    name: string
    email: string
    password: string
    role?: string
    pin?: string | null
    active?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type UserCreateOrConnectWithoutTenantInput = {
    where: UserWhereUniqueInput
    create: XOR<UserCreateWithoutTenantInput, UserUncheckedCreateWithoutTenantInput>
  }

  export type UserCreateManyTenantInputEnvelope = {
    data: UserCreateManyTenantInput | UserCreateManyTenantInput[]
    skipDuplicates?: boolean
  }

  export type TenantIntegrationCreateWithoutTenantInput = {
    id?: string
    provider: string
    status?: string
    credentials: JsonNullValueInput | InputJsonValue
    settings: JsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type TenantIntegrationUncheckedCreateWithoutTenantInput = {
    id?: string
    provider: string
    status?: string
    credentials: JsonNullValueInput | InputJsonValue
    settings: JsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type TenantIntegrationCreateOrConnectWithoutTenantInput = {
    where: TenantIntegrationWhereUniqueInput
    create: XOR<TenantIntegrationCreateWithoutTenantInput, TenantIntegrationUncheckedCreateWithoutTenantInput>
  }

  export type TenantIntegrationCreateManyTenantInputEnvelope = {
    data: TenantIntegrationCreateManyTenantInput | TenantIntegrationCreateManyTenantInput[]
    skipDuplicates?: boolean
  }

  export type UserUpsertWithWhereUniqueWithoutTenantInput = {
    where: UserWhereUniqueInput
    update: XOR<UserUpdateWithoutTenantInput, UserUncheckedUpdateWithoutTenantInput>
    create: XOR<UserCreateWithoutTenantInput, UserUncheckedCreateWithoutTenantInput>
  }

  export type UserUpdateWithWhereUniqueWithoutTenantInput = {
    where: UserWhereUniqueInput
    data: XOR<UserUpdateWithoutTenantInput, UserUncheckedUpdateWithoutTenantInput>
  }

  export type UserUpdateManyWithWhereWithoutTenantInput = {
    where: UserScalarWhereInput
    data: XOR<UserUpdateManyMutationInput, UserUncheckedUpdateManyWithoutTenantInput>
  }

  export type UserScalarWhereInput = {
    AND?: UserScalarWhereInput | UserScalarWhereInput[]
    OR?: UserScalarWhereInput[]
    NOT?: UserScalarWhereInput | UserScalarWhereInput[]
    id?: StringFilter<"User"> | string
    tenantId?: StringFilter<"User"> | string
    name?: StringFilter<"User"> | string
    email?: StringFilter<"User"> | string
    password?: StringFilter<"User"> | string
    role?: StringFilter<"User"> | string
    pin?: StringNullableFilter<"User"> | string | null
    active?: BoolFilter<"User"> | boolean
    createdAt?: DateTimeFilter<"User"> | Date | string
    updatedAt?: DateTimeFilter<"User"> | Date | string
  }

  export type TenantIntegrationUpsertWithWhereUniqueWithoutTenantInput = {
    where: TenantIntegrationWhereUniqueInput
    update: XOR<TenantIntegrationUpdateWithoutTenantInput, TenantIntegrationUncheckedUpdateWithoutTenantInput>
    create: XOR<TenantIntegrationCreateWithoutTenantInput, TenantIntegrationUncheckedCreateWithoutTenantInput>
  }

  export type TenantIntegrationUpdateWithWhereUniqueWithoutTenantInput = {
    where: TenantIntegrationWhereUniqueInput
    data: XOR<TenantIntegrationUpdateWithoutTenantInput, TenantIntegrationUncheckedUpdateWithoutTenantInput>
  }

  export type TenantIntegrationUpdateManyWithWhereWithoutTenantInput = {
    where: TenantIntegrationScalarWhereInput
    data: XOR<TenantIntegrationUpdateManyMutationInput, TenantIntegrationUncheckedUpdateManyWithoutTenantInput>
  }

  export type TenantIntegrationScalarWhereInput = {
    AND?: TenantIntegrationScalarWhereInput | TenantIntegrationScalarWhereInput[]
    OR?: TenantIntegrationScalarWhereInput[]
    NOT?: TenantIntegrationScalarWhereInput | TenantIntegrationScalarWhereInput[]
    id?: StringFilter<"TenantIntegration"> | string
    tenantId?: StringFilter<"TenantIntegration"> | string
    provider?: StringFilter<"TenantIntegration"> | string
    status?: StringFilter<"TenantIntegration"> | string
    credentials?: JsonFilter<"TenantIntegration">
    settings?: JsonFilter<"TenantIntegration">
    createdAt?: DateTimeFilter<"TenantIntegration"> | Date | string
    updatedAt?: DateTimeFilter<"TenantIntegration"> | Date | string
  }

  export type TenantCreateWithoutUsersInput = {
    id?: string
    databaseName: string
    databaseUrl: string
    name?: string
    status?: string
    logoUrl?: string | null
    modulos?: NullableJsonNullValueInput | InputJsonValue
    razaoSocial?: string | null
    nomeFantasia?: string | null
    cnpj?: string | null
    ie?: string | null
    im?: string | null
    crt?: number
    logradouro?: string | null
    numero?: string | null
    complemento?: string | null
    bairro?: string | null
    municipio?: string | null
    codMunicipio?: string | null
    uf?: string | null
    cep?: string | null
    telefone?: string | null
    emailContador?: string | null
    nfceAtivo?: boolean
    nfceAutoSync?: boolean
    nfceSerie?: number
    nfceAmbiente?: number
    nfceCsc?: string | null
    nfceIdCsc?: string | null
    certPfx?: Bytes | null
    certSenha?: string | null
    certValidade?: Date | string | null
    cosmosApiKey?: string | null
    mensalidadeValor?: Decimal | DecimalJsLike | number | string | null
    mensalidadeVencimento?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    termsAcceptedAt?: Date | string | null
    tenantIntegrations?: TenantIntegrationCreateNestedManyWithoutTenantInput
  }

  export type TenantUncheckedCreateWithoutUsersInput = {
    id?: string
    databaseName: string
    databaseUrl: string
    name?: string
    status?: string
    logoUrl?: string | null
    modulos?: NullableJsonNullValueInput | InputJsonValue
    razaoSocial?: string | null
    nomeFantasia?: string | null
    cnpj?: string | null
    ie?: string | null
    im?: string | null
    crt?: number
    logradouro?: string | null
    numero?: string | null
    complemento?: string | null
    bairro?: string | null
    municipio?: string | null
    codMunicipio?: string | null
    uf?: string | null
    cep?: string | null
    telefone?: string | null
    emailContador?: string | null
    nfceAtivo?: boolean
    nfceAutoSync?: boolean
    nfceSerie?: number
    nfceAmbiente?: number
    nfceCsc?: string | null
    nfceIdCsc?: string | null
    certPfx?: Bytes | null
    certSenha?: string | null
    certValidade?: Date | string | null
    cosmosApiKey?: string | null
    mensalidadeValor?: Decimal | DecimalJsLike | number | string | null
    mensalidadeVencimento?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    termsAcceptedAt?: Date | string | null
    tenantIntegrations?: TenantIntegrationUncheckedCreateNestedManyWithoutTenantInput
  }

  export type TenantCreateOrConnectWithoutUsersInput = {
    where: TenantWhereUniqueInput
    create: XOR<TenantCreateWithoutUsersInput, TenantUncheckedCreateWithoutUsersInput>
  }

  export type TenantUpsertWithoutUsersInput = {
    update: XOR<TenantUpdateWithoutUsersInput, TenantUncheckedUpdateWithoutUsersInput>
    create: XOR<TenantCreateWithoutUsersInput, TenantUncheckedCreateWithoutUsersInput>
    where?: TenantWhereInput
  }

  export type TenantUpdateToOneWithWhereWithoutUsersInput = {
    where?: TenantWhereInput
    data: XOR<TenantUpdateWithoutUsersInput, TenantUncheckedUpdateWithoutUsersInput>
  }

  export type TenantUpdateWithoutUsersInput = {
    id?: StringFieldUpdateOperationsInput | string
    databaseName?: StringFieldUpdateOperationsInput | string
    databaseUrl?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    logoUrl?: NullableStringFieldUpdateOperationsInput | string | null
    modulos?: NullableJsonNullValueInput | InputJsonValue
    razaoSocial?: NullableStringFieldUpdateOperationsInput | string | null
    nomeFantasia?: NullableStringFieldUpdateOperationsInput | string | null
    cnpj?: NullableStringFieldUpdateOperationsInput | string | null
    ie?: NullableStringFieldUpdateOperationsInput | string | null
    im?: NullableStringFieldUpdateOperationsInput | string | null
    crt?: IntFieldUpdateOperationsInput | number
    logradouro?: NullableStringFieldUpdateOperationsInput | string | null
    numero?: NullableStringFieldUpdateOperationsInput | string | null
    complemento?: NullableStringFieldUpdateOperationsInput | string | null
    bairro?: NullableStringFieldUpdateOperationsInput | string | null
    municipio?: NullableStringFieldUpdateOperationsInput | string | null
    codMunicipio?: NullableStringFieldUpdateOperationsInput | string | null
    uf?: NullableStringFieldUpdateOperationsInput | string | null
    cep?: NullableStringFieldUpdateOperationsInput | string | null
    telefone?: NullableStringFieldUpdateOperationsInput | string | null
    emailContador?: NullableStringFieldUpdateOperationsInput | string | null
    nfceAtivo?: BoolFieldUpdateOperationsInput | boolean
    nfceAutoSync?: BoolFieldUpdateOperationsInput | boolean
    nfceSerie?: IntFieldUpdateOperationsInput | number
    nfceAmbiente?: IntFieldUpdateOperationsInput | number
    nfceCsc?: NullableStringFieldUpdateOperationsInput | string | null
    nfceIdCsc?: NullableStringFieldUpdateOperationsInput | string | null
    certPfx?: NullableBytesFieldUpdateOperationsInput | Bytes | null
    certSenha?: NullableStringFieldUpdateOperationsInput | string | null
    certValidade?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    cosmosApiKey?: NullableStringFieldUpdateOperationsInput | string | null
    mensalidadeValor?: NullableDecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string | null
    mensalidadeVencimento?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    termsAcceptedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    tenantIntegrations?: TenantIntegrationUpdateManyWithoutTenantNestedInput
  }

  export type TenantUncheckedUpdateWithoutUsersInput = {
    id?: StringFieldUpdateOperationsInput | string
    databaseName?: StringFieldUpdateOperationsInput | string
    databaseUrl?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    logoUrl?: NullableStringFieldUpdateOperationsInput | string | null
    modulos?: NullableJsonNullValueInput | InputJsonValue
    razaoSocial?: NullableStringFieldUpdateOperationsInput | string | null
    nomeFantasia?: NullableStringFieldUpdateOperationsInput | string | null
    cnpj?: NullableStringFieldUpdateOperationsInput | string | null
    ie?: NullableStringFieldUpdateOperationsInput | string | null
    im?: NullableStringFieldUpdateOperationsInput | string | null
    crt?: IntFieldUpdateOperationsInput | number
    logradouro?: NullableStringFieldUpdateOperationsInput | string | null
    numero?: NullableStringFieldUpdateOperationsInput | string | null
    complemento?: NullableStringFieldUpdateOperationsInput | string | null
    bairro?: NullableStringFieldUpdateOperationsInput | string | null
    municipio?: NullableStringFieldUpdateOperationsInput | string | null
    codMunicipio?: NullableStringFieldUpdateOperationsInput | string | null
    uf?: NullableStringFieldUpdateOperationsInput | string | null
    cep?: NullableStringFieldUpdateOperationsInput | string | null
    telefone?: NullableStringFieldUpdateOperationsInput | string | null
    emailContador?: NullableStringFieldUpdateOperationsInput | string | null
    nfceAtivo?: BoolFieldUpdateOperationsInput | boolean
    nfceAutoSync?: BoolFieldUpdateOperationsInput | boolean
    nfceSerie?: IntFieldUpdateOperationsInput | number
    nfceAmbiente?: IntFieldUpdateOperationsInput | number
    nfceCsc?: NullableStringFieldUpdateOperationsInput | string | null
    nfceIdCsc?: NullableStringFieldUpdateOperationsInput | string | null
    certPfx?: NullableBytesFieldUpdateOperationsInput | Bytes | null
    certSenha?: NullableStringFieldUpdateOperationsInput | string | null
    certValidade?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    cosmosApiKey?: NullableStringFieldUpdateOperationsInput | string | null
    mensalidadeValor?: NullableDecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string | null
    mensalidadeVencimento?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    termsAcceptedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    tenantIntegrations?: TenantIntegrationUncheckedUpdateManyWithoutTenantNestedInput
  }

  export type TenantCreateWithoutTenantIntegrationsInput = {
    id?: string
    databaseName: string
    databaseUrl: string
    name?: string
    status?: string
    logoUrl?: string | null
    modulos?: NullableJsonNullValueInput | InputJsonValue
    razaoSocial?: string | null
    nomeFantasia?: string | null
    cnpj?: string | null
    ie?: string | null
    im?: string | null
    crt?: number
    logradouro?: string | null
    numero?: string | null
    complemento?: string | null
    bairro?: string | null
    municipio?: string | null
    codMunicipio?: string | null
    uf?: string | null
    cep?: string | null
    telefone?: string | null
    emailContador?: string | null
    nfceAtivo?: boolean
    nfceAutoSync?: boolean
    nfceSerie?: number
    nfceAmbiente?: number
    nfceCsc?: string | null
    nfceIdCsc?: string | null
    certPfx?: Bytes | null
    certSenha?: string | null
    certValidade?: Date | string | null
    cosmosApiKey?: string | null
    mensalidadeValor?: Decimal | DecimalJsLike | number | string | null
    mensalidadeVencimento?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    termsAcceptedAt?: Date | string | null
    users?: UserCreateNestedManyWithoutTenantInput
  }

  export type TenantUncheckedCreateWithoutTenantIntegrationsInput = {
    id?: string
    databaseName: string
    databaseUrl: string
    name?: string
    status?: string
    logoUrl?: string | null
    modulos?: NullableJsonNullValueInput | InputJsonValue
    razaoSocial?: string | null
    nomeFantasia?: string | null
    cnpj?: string | null
    ie?: string | null
    im?: string | null
    crt?: number
    logradouro?: string | null
    numero?: string | null
    complemento?: string | null
    bairro?: string | null
    municipio?: string | null
    codMunicipio?: string | null
    uf?: string | null
    cep?: string | null
    telefone?: string | null
    emailContador?: string | null
    nfceAtivo?: boolean
    nfceAutoSync?: boolean
    nfceSerie?: number
    nfceAmbiente?: number
    nfceCsc?: string | null
    nfceIdCsc?: string | null
    certPfx?: Bytes | null
    certSenha?: string | null
    certValidade?: Date | string | null
    cosmosApiKey?: string | null
    mensalidadeValor?: Decimal | DecimalJsLike | number | string | null
    mensalidadeVencimento?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    termsAcceptedAt?: Date | string | null
    users?: UserUncheckedCreateNestedManyWithoutTenantInput
  }

  export type TenantCreateOrConnectWithoutTenantIntegrationsInput = {
    where: TenantWhereUniqueInput
    create: XOR<TenantCreateWithoutTenantIntegrationsInput, TenantUncheckedCreateWithoutTenantIntegrationsInput>
  }

  export type TenantUpsertWithoutTenantIntegrationsInput = {
    update: XOR<TenantUpdateWithoutTenantIntegrationsInput, TenantUncheckedUpdateWithoutTenantIntegrationsInput>
    create: XOR<TenantCreateWithoutTenantIntegrationsInput, TenantUncheckedCreateWithoutTenantIntegrationsInput>
    where?: TenantWhereInput
  }

  export type TenantUpdateToOneWithWhereWithoutTenantIntegrationsInput = {
    where?: TenantWhereInput
    data: XOR<TenantUpdateWithoutTenantIntegrationsInput, TenantUncheckedUpdateWithoutTenantIntegrationsInput>
  }

  export type TenantUpdateWithoutTenantIntegrationsInput = {
    id?: StringFieldUpdateOperationsInput | string
    databaseName?: StringFieldUpdateOperationsInput | string
    databaseUrl?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    logoUrl?: NullableStringFieldUpdateOperationsInput | string | null
    modulos?: NullableJsonNullValueInput | InputJsonValue
    razaoSocial?: NullableStringFieldUpdateOperationsInput | string | null
    nomeFantasia?: NullableStringFieldUpdateOperationsInput | string | null
    cnpj?: NullableStringFieldUpdateOperationsInput | string | null
    ie?: NullableStringFieldUpdateOperationsInput | string | null
    im?: NullableStringFieldUpdateOperationsInput | string | null
    crt?: IntFieldUpdateOperationsInput | number
    logradouro?: NullableStringFieldUpdateOperationsInput | string | null
    numero?: NullableStringFieldUpdateOperationsInput | string | null
    complemento?: NullableStringFieldUpdateOperationsInput | string | null
    bairro?: NullableStringFieldUpdateOperationsInput | string | null
    municipio?: NullableStringFieldUpdateOperationsInput | string | null
    codMunicipio?: NullableStringFieldUpdateOperationsInput | string | null
    uf?: NullableStringFieldUpdateOperationsInput | string | null
    cep?: NullableStringFieldUpdateOperationsInput | string | null
    telefone?: NullableStringFieldUpdateOperationsInput | string | null
    emailContador?: NullableStringFieldUpdateOperationsInput | string | null
    nfceAtivo?: BoolFieldUpdateOperationsInput | boolean
    nfceAutoSync?: BoolFieldUpdateOperationsInput | boolean
    nfceSerie?: IntFieldUpdateOperationsInput | number
    nfceAmbiente?: IntFieldUpdateOperationsInput | number
    nfceCsc?: NullableStringFieldUpdateOperationsInput | string | null
    nfceIdCsc?: NullableStringFieldUpdateOperationsInput | string | null
    certPfx?: NullableBytesFieldUpdateOperationsInput | Bytes | null
    certSenha?: NullableStringFieldUpdateOperationsInput | string | null
    certValidade?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    cosmosApiKey?: NullableStringFieldUpdateOperationsInput | string | null
    mensalidadeValor?: NullableDecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string | null
    mensalidadeVencimento?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    termsAcceptedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    users?: UserUpdateManyWithoutTenantNestedInput
  }

  export type TenantUncheckedUpdateWithoutTenantIntegrationsInput = {
    id?: StringFieldUpdateOperationsInput | string
    databaseName?: StringFieldUpdateOperationsInput | string
    databaseUrl?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    logoUrl?: NullableStringFieldUpdateOperationsInput | string | null
    modulos?: NullableJsonNullValueInput | InputJsonValue
    razaoSocial?: NullableStringFieldUpdateOperationsInput | string | null
    nomeFantasia?: NullableStringFieldUpdateOperationsInput | string | null
    cnpj?: NullableStringFieldUpdateOperationsInput | string | null
    ie?: NullableStringFieldUpdateOperationsInput | string | null
    im?: NullableStringFieldUpdateOperationsInput | string | null
    crt?: IntFieldUpdateOperationsInput | number
    logradouro?: NullableStringFieldUpdateOperationsInput | string | null
    numero?: NullableStringFieldUpdateOperationsInput | string | null
    complemento?: NullableStringFieldUpdateOperationsInput | string | null
    bairro?: NullableStringFieldUpdateOperationsInput | string | null
    municipio?: NullableStringFieldUpdateOperationsInput | string | null
    codMunicipio?: NullableStringFieldUpdateOperationsInput | string | null
    uf?: NullableStringFieldUpdateOperationsInput | string | null
    cep?: NullableStringFieldUpdateOperationsInput | string | null
    telefone?: NullableStringFieldUpdateOperationsInput | string | null
    emailContador?: NullableStringFieldUpdateOperationsInput | string | null
    nfceAtivo?: BoolFieldUpdateOperationsInput | boolean
    nfceAutoSync?: BoolFieldUpdateOperationsInput | boolean
    nfceSerie?: IntFieldUpdateOperationsInput | number
    nfceAmbiente?: IntFieldUpdateOperationsInput | number
    nfceCsc?: NullableStringFieldUpdateOperationsInput | string | null
    nfceIdCsc?: NullableStringFieldUpdateOperationsInput | string | null
    certPfx?: NullableBytesFieldUpdateOperationsInput | Bytes | null
    certSenha?: NullableStringFieldUpdateOperationsInput | string | null
    certValidade?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    cosmosApiKey?: NullableStringFieldUpdateOperationsInput | string | null
    mensalidadeValor?: NullableDecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string | null
    mensalidadeVencimento?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    termsAcceptedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    users?: UserUncheckedUpdateManyWithoutTenantNestedInput
  }

  export type UserCreateManyTenantInput = {
    id?: string
    name: string
    email: string
    password: string
    role?: string
    pin?: string | null
    active?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type TenantIntegrationCreateManyTenantInput = {
    id?: string
    provider: string
    status?: string
    credentials: JsonNullValueInput | InputJsonValue
    settings: JsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type UserUpdateWithoutTenantInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    password?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    pin?: NullableStringFieldUpdateOperationsInput | string | null
    active?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type UserUncheckedUpdateWithoutTenantInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    password?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    pin?: NullableStringFieldUpdateOperationsInput | string | null
    active?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type UserUncheckedUpdateManyWithoutTenantInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    password?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    pin?: NullableStringFieldUpdateOperationsInput | string | null
    active?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type TenantIntegrationUpdateWithoutTenantInput = {
    id?: StringFieldUpdateOperationsInput | string
    provider?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    credentials?: JsonNullValueInput | InputJsonValue
    settings?: JsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type TenantIntegrationUncheckedUpdateWithoutTenantInput = {
    id?: StringFieldUpdateOperationsInput | string
    provider?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    credentials?: JsonNullValueInput | InputJsonValue
    settings?: JsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type TenantIntegrationUncheckedUpdateManyWithoutTenantInput = {
    id?: StringFieldUpdateOperationsInput | string
    provider?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    credentials?: JsonNullValueInput | InputJsonValue
    settings?: JsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }



  /**
   * Batch Payload for updateMany & deleteMany & createMany
   */

  export type BatchPayload = {
    count: number
  }

  /**
   * DMMF
   */
  export const dmmf: runtime.BaseDMMF
}