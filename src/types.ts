import { ActionStatus, WorkflowStatus } from './enums'

export type ActionName = string | number | symbol

export interface ObjectDependency<TActionName = ActionName> {
  action: TActionName
  with: ActionStatus
}

export type Dependency<TActionName = ActionName> =
  | TActionName
  | ObjectDependency<TActionName>

export interface ActionActions {
  setStatus: (status: ActionStatus | WorkflowStatus) => void
}

export type ReturnTypes = {
  [ActionName in number | string]: unknown
}

export type ProvidedDeps<
  TReturnTypes extends ReturnTypes,
  TDeps extends Array<keyof TReturnTypes>
> = {
  [Dep in TDeps[number]]: TReturnTypes[Dep]
}

export type ActionRunner<
  TReturnTypes extends ReturnTypes,
  TActionName extends keyof TReturnTypes,
  TDeps extends Array<keyof TReturnTypes> = Array<keyof TReturnTypes>
> = (
  input: Readonly<ProvidedDeps<TReturnTypes, TDeps>>,
  actions: ActionActions
) => TReturnTypes[TActionName] | Promise<TReturnTypes[TActionName]>

export interface Action<
  TReturnTypes extends ReturnTypes,
  TActionName extends keyof TReturnTypes,
  TOtherActionName extends Exclude<keyof TReturnTypes, TActionName>,
  TDeps extends Array<keyof TReturnTypes> = Array<keyof TReturnTypes>
> {
  deps?: TDeps
  needs?: Dependency<TOtherActionName>[]
  needsAnyOf?: Dependency<TOtherActionName>[]
  needsWorkflow?: WorkflowStatus
  if?: (
    input: Readonly<ProvidedDeps<TReturnTypes, TDeps>>
  ) => boolean | Promise<boolean>
  run: ActionRunner<TReturnTypes, TActionName, TDeps>
}

export type Actions<TReturnTypes extends ReturnTypes> = {
  [ActionName in keyof TReturnTypes]: Action<
    TReturnTypes,
    ActionName,
    Exclude<keyof TReturnTypes, ActionName>
  >
}

export interface WorkflowState {
  isFinished: boolean
  status: WorkflowStatus
}
