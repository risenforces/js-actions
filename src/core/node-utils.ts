import { ActionName, WorkflowState } from '../types'
import { ActionStatus, NodeStatus, WorkflowStatus } from '../enums'
import { DependencyGraph, EdgeType } from './types'

export function getIndependentNodes<TActionName extends ActionName>(
  graph: DependencyGraph<TActionName>
): TActionName[] {
  return graph.nodes.filter((node) => {
    const edgesIn = graph.edgesIn[node]
    if (edgesIn.length > 0) return false
    const dependsOnWorkflow = graph.nodesDependsOnWorkflow.has(node)
    if (dependsOnWorkflow) return false
    return true
  })
}

export function getWorkflowNodes<TActionName extends ActionName>(
  graph: DependencyGraph<TActionName>
): TActionName[] {
  return Array.from(graph.nodesDependsOnWorkflow)
}

export function getNextNodes<TActionName extends ActionName>(
  node: TActionName,
  graph: DependencyGraph<TActionName>
): TActionName[] {
  return graph.edgesOut[node].map((edge) => edge.to)
}

// eslint-disable-next-line sonarjs/cognitive-complexity
export function getNodeStatus<TActionName extends ActionName>({
  node,
  graph,
  statusMap,
  runningSet,
  conditionsNotMetSet,
  workflowState,
}: {
  node: TActionName
  graph: DependencyGraph<TActionName>
  statusMap: Map<TActionName, ActionStatus>
  runningSet: Set<TActionName>
  conditionsNotMetSet: Set<TActionName>
  workflowState: WorkflowState
}): NodeStatus {
  const allStats = {
    [EdgeType.AllIn]: {
      total: 0,
      finished: 0,
      met: 0,
      notMet: 0,
    },
    [EdgeType.AnyOf]: {
      total: 0,
      finished: 0,
      met: 0,
      notMet: 0,
    },
  }

  if (runningSet.has(node)) {
    return NodeStatus.Running
  }

  if (statusMap.has(node)) {
    return NodeStatus.Finished
  }

  if (conditionsNotMetSet.has(node)) {
    return NodeStatus.Skipped
  }

  if (graph.nodesDependsOnWorkflow.has(node)) {
    if (!workflowState.isFinished) return NodeStatus.NotReady

    const requiredStatus = graph.workflowStatusesByNode.get(node)
    if (!requiredStatus) return NodeStatus.Skipped

    const shouldNotCheckStatus = requiredStatus === WorkflowStatus.Any

    const stats = allStats[EdgeType.AllIn]

    stats.total += 1
    stats.finished += 1

    if (shouldNotCheckStatus || requiredStatus === workflowState.status) {
      stats.met += 1
    } else {
      stats.notMet += 1
    }
  }

  const edgesIn = graph.edgesIn[node]

  for (const edge of edgesIn) {
    const { from, meta } = edge

    const isRunning = runningSet.has(from)
    const status = statusMap.get(from)
    const isFinished = Boolean(status)
    const shouldNotCheckStatus = meta.status === ActionStatus.Any

    const stats = allStats[meta.type]

    stats.total += 1

    if (isRunning) continue
    if (!isFinished) continue
    stats.finished += 1

    if (shouldNotCheckStatus || status === meta.status) {
      stats.met += 1
    } else {
      stats.notMet += 1
    }
  }

  const allIn = allStats[EdgeType.AllIn]
  const anyOf = allStats[EdgeType.AnyOf]

  /*
   * Check all-in edges first
   * To meet the conditions, every dependency should match
   */

  // if at least one dependency is not met, action should be skipped
  if (allIn.notMet > 0) return NodeStatus.Skipped

  // we should wait until every action finishes, since some of remaining actions can fail condition
  if (allIn.finished < allIn.total) return NodeStatus.NotReady

  /*
   * Check any-of edges
   * To meet the conditions, at least one dependency should match
   */

  // no any-of edges, ready instantly
  if (anyOf.total === 0) return NodeStatus.Ready

  // some dependency already matches, ready instantly
  if (anyOf.met > 0) return NodeStatus.Ready

  // total > 0, met === 0, all finished
  // no matching dependencies, action should be skipped
  if (anyOf.finished === anyOf.total) return NodeStatus.Skipped

  // no matching dependencies yet, but some is not finished at the moment
  // just wait
  return NodeStatus.NotReady
}
