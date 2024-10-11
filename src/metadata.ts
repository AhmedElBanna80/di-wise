import type {Injection} from './injection'
import type {InjectionScope} from './scope'
import type {Constructor, InjectionToken} from './token'

export interface InjectionMetadata<This extends object = any> {
  scope?: InjectionScope
  tokens: InjectionToken<This>[]
  dependencies: InjectionDependency<This>[]
}

export interface InjectionDependency<This extends object, Value = any> {
  injections: Injection<Value>[]
  setValue(instance: This, value: Value): void
}

class InjectionMetadataRegistry {
  private readonly map = new WeakMap<DecoratorMetadata, InjectionMetadata>()

  get<T extends object>(key: DecoratorMetadata): InjectionMetadata<T> | undefined {
    return this.map.get(key)
  }

  ensure<T extends object>(key: DecoratorMetadata): InjectionMetadata<T> {
    let metadata = this.map.get(key)
    if (!metadata) {
      metadata = {tokens: [], dependencies: []}
      this.map.set(key, metadata)
    }
    return metadata
  }
}

/** @internal */
export const metadataRegistry = new InjectionMetadataRegistry()

/** @internal */
export function getMetadata<T extends object>(Class: Constructor<T>) {
  const decoratorMetadata = Class[Symbol.metadata]
  return decoratorMetadata && metadataRegistry.get<T>(decoratorMetadata)
}
