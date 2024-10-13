import {type InjectionConfig, isConfigLike} from './config'
import {assert, ErrorMessage, expectNever, invariant} from './errors'
import type {Injections} from './injection'
import {useInjectionContext, withInjectionContext} from './injection-context'
import {getMetadata} from './metadata'
import {type InjectionProvider, isClassProvider, isFactoryProvider, isProvider, isValueProvider} from './provider'
import {InjectionScope} from './scope'
import {type Constructor, type InjectionToken, isConstructor, Type} from './token'
import {Stack} from './utils/stack'

const ProviderRegistry: typeof Map<InjectionToken, InjectionProvider> = Map

const InstanceCache: typeof Map<InjectionToken, any> = Map

export interface ContainerOptions {
  parent?: Container
  defaultScope?: InjectionScope
}

export class Container {
  #reservedRegistry = new ProviderRegistry([
    [Type.Any, null!],
    [Type.Null, {token: Type.Null, useValue: null}],
    [Type.Undefined, {token: Type.Undefined, useValue: undefined}],
  ])

  #providerRegistry = new ProviderRegistry()

  get unsafe_providerRegistry(): InstanceType<typeof ProviderRegistry> {
    return this.#providerRegistry
  }

  #instanceCache = new InstanceCache()

  get unsafe_instanceCache(): InstanceType<typeof InstanceCache> {
    return this.#instanceCache
  }

  parent?: Container
  defaultScope: InjectionScope

  constructor(options?: ContainerOptions)
  constructor({parent, defaultScope = InjectionScope.Inherited}: ContainerOptions = {}) {
    this.parent = parent
    this.defaultScope = defaultScope
    this.#reservedRegistry.set(Container, {token: Container, useValue: this})
  }

  createChild(): Container {
    return new Container({
      parent: this,
      defaultScope: this.defaultScope,
    })
  }

  clearCache(): void {
    this.#instanceCache.clear()
  }

  resetRegistry(): void {
    this.#instanceCache.clear()
    this.#providerRegistry.clear()
  }

  isRegistered<Value>(token: InjectionToken<Value>): boolean {
    return (
      this.#providerRegistry.has(token)
      || !!(this.parent?.isRegistered(token))
    )
  }

  #getProvider<Value>(token: InjectionToken<Value>) {
    return (
      this.#reservedRegistry.get(token)
      || this.#providerRegistry.get(token)
    )
  }

  #setProvider<Value>(token: InjectionToken<Value>, provider: InjectionProvider<Value>) {
    assert(!this.#reservedRegistry.has(token), ErrorMessage.ReservedToken, token.name)
    this.#providerRegistry.set(token, provider)
  }

  register<Instance extends object>(Class: Constructor<Instance>): void
  register<Value>(provider: InjectionProvider<Value>): void
  register<Value>(providable: InjectionProvider<Value> | Constructor<Value & object>): void {
    if (isConstructor(providable)) {
      const Class = providable
      const metadata = getMetadata(Class)
      const tokens = [Class, ...(metadata?.tokens || [])]
      tokens.forEach((token) => {
        const provider = {
          token,
          useClass: Class,
          scope: metadata?.scope,
        }
        this.#setProvider(token, provider)
      })
    }
    else {
      const provider = providable
      const token = provider.token
      this.#setProvider(token, provider)
    }
  }

  resolve<Values extends unknown[]>(...injections: Injections<Values>): Values[number] {
    for (const injection of injections) {
      if (isConfigLike(injection)) {
        if (isProvider(injection)) {
          const provider = injection
          return this.resolveValue(provider)
        }
        const config = injection
        const token = config.token
        const provider = this.resolveProvider(token)
        if (provider) {
          const scope = config.scope
          return this.resolveValue({...provider, ...(scope && {scope})})
        }
      }
      else {
        const token = injection
        const provider = this.resolveProvider(token)
        if (provider) {
          return this.resolveValue(provider)
        }
      }
    }
    const tokenNames = injections.map((injection) => {
      if (isConfigLike(injection)) {
        const config = injection
        const token = config.token
        return token.name
      }
      const token = injection
      return token.name
    })
    assert(false, ErrorMessage.UnresolvableToken, tokenNames.join(', '))
  }

  resolveProvider<Value>(token: InjectionToken<Value>): InjectionProvider<Value> | undefined {
    if (isConstructor(token)) {
      const Class = token
      const provider = this.#getProvider(token)
      if (provider) {
        return provider
      }
      const metadata = getMetadata(Class)
      return {
        token,
        useClass: Class,
        scope: metadata?.scope,
      }
    }
    else {
      const provider = this.#getProvider(token)
      if (provider) {
        return provider
      }
      return this.parent?.resolveProvider(token)
    }
  }

  resolveValue<Value>(provider: InjectionProvider<Value>): Value {
    if (isClassProvider(provider)) {
      const Class = provider.useClass
      return this.#resolveScopedInstance(provider, () => new Class())
    }
    else if (isFactoryProvider(provider)) {
      const factory = provider.useFactory
      return this.#resolveScopedInstance(provider, factory)
    }
    else if (isValueProvider(provider)) {
      const value = provider.useValue
      return value
    }
    expectNever(provider)
  }

  #resolveScopedInstance<T>({token, scope = this.defaultScope}: InjectionConfig<T>, instantiate: () => T): T {
    let resolvedScope = scope
    let context = useInjectionContext()
    if (context) {
      if (context.container != this) {
        return withInjectionContext({
          container: this,
          resolution: {
            ...context.resolution,
            instances: new Map(),
          },
        }, () => this.#resolveScopedInstance({token, scope}, instantiate))
      }
      const resolution = context.resolution
      if (resolution.stack.has(token)) {
        if (resolution.dependents.has(token)) {
          return resolution.dependents.get(token)
        }
        assert(false, ErrorMessage.CircularDependency, token.name)
      }
      if (resolvedScope == InjectionScope.Inherited) {
        const dependentFrame = resolution.stack.peek()
        invariant(dependentFrame)
        resolvedScope = dependentFrame.scope
      }
    }
    else {
      if (resolvedScope == InjectionScope.Inherited) {
        resolvedScope = InjectionScope.Transient
      }
      context = {
        container: this,
        resolution: {
          stack: new Stack(),
          instances: new Map(),
          dependents: new Map(),
        },
      }
    }
    const instantiateWithContext = () => {
      const hasContext = !!useInjectionContext()
      if (hasContext) {
        return instantiate()
      }
      return withInjectionContext(context, instantiate)
    }
    const resolution = context.resolution
    resolution.stack.push(token, {token, scope: resolvedScope})
    try {
      if (resolvedScope == InjectionScope.Container) {
        if (this.#instanceCache.has(token)) {
          return this.#instanceCache.get(token)
        }
        const instance = instantiateWithContext()
        this.#instanceCache.set(token, instance)
        return instance
      }
      else if (resolvedScope == InjectionScope.Resolution) {
        if (resolution.instances.has(token)) {
          return resolution.instances.get(token)
        }
        const instance = instantiateWithContext()
        resolution.instances.set(token, instance)
        return instance
      }
      else if (resolvedScope == InjectionScope.Transient) {
        return instantiateWithContext()
      }
    }
    finally {
      resolution.stack.pop()
    }
    expectNever(resolvedScope)
  }
}
