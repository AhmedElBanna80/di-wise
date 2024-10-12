// @ts-expect-error: readonly property
Symbol.metadata ||= Symbol('Symbol.metadata')

export type {InjectionConfig, InjectionConfigLike, InjectionScopeConfig} from './config'
export type {ContainerOptions} from './container'
export {Container} from './container'
export type {ClassDecorator, ClassFieldDecorator, ClassFieldInitializer} from './decorators'
export {Inject, Injectable, Scoped} from './decorators'
export {ErrorMessage} from './errors'
export {inject} from './inject'
export type {Injection, Injections} from './injection'
export type {ClassProvider, Factory, FactoryProvider, InjectionProvider, ValueProvider} from './provider'
export {Build, defineProvider, Value} from './provider'
export {InjectionScope} from './scope'
export type {Constructor, InjectionToken} from './token'
export {Type} from './token'
