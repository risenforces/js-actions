import { runPipeline } from './run-pipeline'
import { ActionName, ActionRunner } from './types'
import { ActionStatus, WorkflowStatus } from './enums'

let callSequence: ActionName[] = []

function fn<TActionName extends ActionName>(
  actionName: TActionName,
  status?: ActionStatus | WorkflowStatus
): ActionRunner<Record<TActionName, unknown>, TActionName> {
  return (_, { setStatus }) => {
    callSequence.push(actionName)
    if (status) setStatus(status)
    return actionName
  }
}

function fnDeps<TActionName extends ActionName>(
  actionName: TActionName,
  deps: TActionName[],
  status?: ActionStatus | WorkflowStatus
): ActionRunner<Record<TActionName, unknown>, TActionName> {
  return (providedDeps, { setStatus }) => {
    for (const dep of deps) {
      expect(providedDeps).toHaveProperty(String(dep))
    }
    callSequence.push(actionName)
    if (status) setStatus(status)
    return actionName
  }
}

function asyncFn<TActionName extends ActionName>(
  actionName: TActionName,
  ms: number,
  status?: ActionStatus | WorkflowStatus
): ActionRunner<Record<TActionName, unknown>, TActionName> {
  return (_, { setStatus }) => {
    callSequence.push(actionName)
    if (status) setStatus(status)
    return new Promise<TActionName>((resolve) => {
      setTimeout(() => resolve(actionName), ms)
    })
  }
}

function order(nodeA: ActionName, nodeB: ActionName) {
  expect(callSequence.indexOf(nodeA)).toBeLessThan(callSequence.indexOf(nodeB))
}

function orderSome(nodes: ActionName[], nodeB: ActionName) {
  expect(
    nodes
      .map((node) => callSequence.indexOf(node))
      .some((index) => index < callSequence.indexOf(nodeB))
  ).toBe(true)
}

function orderEvery(nodes: ActionName[], nodeB: ActionName) {
  expect(
    nodes
      .map((node) => callSequence.indexOf(node))
      .every((index) => index < callSequence.indexOf(nodeB))
  ).toBe(true)
}

beforeAll(() => {
  jest.setTimeout(30000)
})

afterAll(() => {
  jest.setTimeout(5000)
})

beforeEach(() => {
  callSequence = []
})

describe('run', () => {
  test('deps', async () => {
    await runPipeline({
      4: {
        deps: ['3'],
        run: fnDeps(4, [3]),
      },
      1: {
        run: fn(1),
      },
      2: {
        run: fn(2),
      },
      3: {
        deps: ['1'],
        run: fnDeps(3, [1]),
      },
      5: {
        deps: ['1', '2'],
        run: fnDeps(5, [1, 2]),
      },
      6: {
        deps: ['4', '5'],
        run: fnDeps(6, [4, 5]),
      },
    })

    order(1, 3)
    order(1, 5)
    order(2, 5)
    order(3, 4)
    order(4, 6)
    order(5, 6)
  })

  test('needs', async () => {
    await runPipeline({
      4: {
        needs: ['3'],
        run: fn(4),
      },
      1: {
        run: fn(1),
      },
      2: {
        run: fn(2),
      },
      3: {
        needs: ['1'],
        run: fn(3),
      },
      5: {
        needs: ['1', '2'],
        run: fn(5),
      },
      6: {
        needs: ['4', '5'],
        run: fn(6),
      },
    })

    order(1, 3)
    order(1, 5)
    order(2, 5)
    order(3, 4)
    order(4, 6)
    order(5, 6)
  })

  test('needsAnyOf', async () => {
    await runPipeline({
      1: {
        run: fn(1),
      },
      2: {
        run: fn(2),
      },
      3: {
        needsAnyOf: ['1', '2'],
        run: fn(3),
      },
      4: {
        needsAnyOf: ['3', '1'],
        run: fn(4),
      },
      5: {
        needsAnyOf: ['2'],
        run: fn(5),
      },
      6: {
        needsAnyOf: ['5', '4'],
        run: fn(6),
      },
    })

    order(1, 3)
    order(2, 3)
    order(1, 4)
    order(4, 3)
    order(2, 5)
    order(5, 6)
    order(4, 6)
  })

  test('needsWorkflow', async () => {
    await runPipeline({
      1: {
        run: fn(1),
      },
      2: {
        run: fn(2),
      },
      3: {
        needsAnyOf: ['1', '2'],
        run: fn(3),
      },
      4: {
        needsAnyOf: ['3', '1'],
        run: fn(4),
      },
      5: {
        needsWorkflow: WorkflowStatus.Ok,
        run: fn(5),
      },
      6: {
        needs: ['5'],
        run: fn(6),
      },
      7: {
        needsAnyOf: ['5'],
        run: fn(7),
      },
    })

    orderSome([1, 2], 3)
    orderSome([3, 1], 4)
    order(1, 5)
    order(2, 5)
    order(3, 5)
    order(4, 5)
    order(5, 6)
    order(5, 7)
  })

  test('combined', async () => {
    await runPipeline({
      1: {
        run: fn(1),
      },
      2: {
        needs: ['1'],
        run: fn(2),
      },
      3: {
        run: fn(3),
      },
      4: {
        needs: ['3'],
        run: fn(4),
      },
      5: {
        needs: ['1'],
        needsAnyOf: ['2', '4'],
        run: fn(5),
      },
      6: {
        needs: ['4'],
        needsAnyOf: ['1', '3'],
        run: fn(6),
      },
      7: {
        needsWorkflow: WorkflowStatus.Ok,
        run: fn(7),
      },
      8: {
        needsWorkflow: WorkflowStatus.Ok,
        run: fn(8),
      },
      9: {
        needsAnyOf: ['7', '8'],
        run: fn(9),
      },
      10: {
        needs: ['9'],
        run: fn(10),
      },
    })

    order(1, 2)
    order(3, 4)
    order(1, 5)
    orderSome([2, 4], 5)
    order(4, 6)
    orderSome([1, 3], 6)
    orderEvery([1, 2, 3, 4, 5, 6], 7)
    orderEvery([1, 2, 3, 4, 5, 6], 8)
    orderSome([7, 8], 9)
    order(9, 10)
  })

  test('needs with statuses', async () => {
    await runPipeline({
      1: {
        run: fn(1),
      },
      2: {
        run: fn(2, ActionStatus.Fail),
      },
      3: {
        needs: ['1'],
        run: fn(3),
      },
      4: {
        needs: ['3'],
        run: fn(4, ActionStatus.Cancel),
      },
      5: {
        needs: ['1', { action: '2', with: ActionStatus.Fail }],
        run: fn(5),
      },
      6: {
        needs: [{ action: '4', with: ActionStatus.Cancel }, '5'],
        run: fn(6),
      },
      7: {
        needs: ['2'],
        run: fn(7),
      },
      8: {
        needs: ['7'],
        needsAnyOf: ['1', { action: '4', with: ActionStatus.Cancel }],
        run: fn(8),
      },
    })

    order(1, 3)
    order(3, 4)
    order(1, 5)
    order(2, 5)
    order(4, 6)
    order(5, 6)
    expect(callSequence).not.toContain(7)
    expect(callSequence).not.toContain(8)
  })

  test('needsAnyOf with statuses', async () => {
    await runPipeline({
      1: {
        run: fn(1),
      },
      2: {
        run: fn(2, ActionStatus.Fail),
      },
      3: {
        needs: ['1'],
        run: fn(3),
      },
      4: {
        needs: ['3'],
        run: fn(4, ActionStatus.Cancel),
      },
      5: {
        needsAnyOf: [
          { action: '4', with: ActionStatus.Cancel },
          { action: '2', with: ActionStatus.Fail },
        ],
        run: fn(5),
      },
      6: {
        needs: [{ action: '4', with: ActionStatus.Cancel }, '5'],
        run: fn(6),
      },
      7: {
        needsAnyOf: [{ action: '2', with: ActionStatus.Cancel }],
        run: fn(7),
      },
      8: {
        needs: ['7'],
        needsAnyOf: ['1', { action: '4', with: ActionStatus.Cancel }],
        run: fn(8),
      },
    })

    order(1, 3)
    order(3, 4)
    order(1, 5)
    order(2, 5)
    order(4, 6)
    order(5, 6)
    expect(callSequence).not.toContain(7)
    expect(callSequence).not.toContain(8)
  })

  test('needsWorkflow with custom status', async () => {
    await runPipeline({
      1: {
        run: fn(1),
      },
      2: {
        run: fn(2),
      },
      3: {
        needsAnyOf: ['1', '2'],
        run: fn(3, WorkflowStatus.Fail),
      },
      4: {
        needsAnyOf: ['3', '1'],
        run: fn(4),
      },
      5: {
        needsWorkflow: WorkflowStatus.Ok,
        run: fn(5),
      },
      6: {
        needs: ['5'],
        run: fn(6),
      },
      7: {
        needsAnyOf: ['5'],
        run: fn(7),
      },
      8: {
        needsWorkflow: WorkflowStatus.Fail,
        run: fn(8),
      },
      9: {
        needs: ['8'],
        run: fn(9),
      },
    })

    orderSome([1, 2], 3)
    order(1, 4)
    expect(callSequence).not.toContain(5)
    expect(callSequence).not.toContain(6)
    expect(callSequence).not.toContain(7)
    order(3, 8)
    order(8, 9)
  })

  test('async complex', async () => {
    await runPipeline({
      1: {
        run: fn(1),
      },
      2: {
        run: asyncFn(2, 50),
      },
      3: {
        run: asyncFn(3, 200),
      },
      9: {
        needsWorkflow: WorkflowStatus.Any,
        run: asyncFn(9, 50),
      },
      11: {
        run: asyncFn(11, 100, ActionStatus.Fail),
      },
      4: {
        needs: ['1', '2'],
        run: asyncFn(4, 50),
      },
      13: {
        needsAnyOf: [{ action: '12', with: ActionStatus.Skip }],
        run: fn(13),
      },
      5: {
        needs: ['3', '4'],
        run: asyncFn(5, 50),
      },
      6: {
        needsAnyOf: ['2', '3'],
        run: asyncFn(6, 50),
      },
      14: {
        needsWorkflow: WorkflowStatus.Fail,
        run: fn(14),
      },
      7: {
        needsAnyOf: ['6', '3'],
        run: asyncFn(7, 50),
      },
      12: {
        needs: ['10', '11'],
        run: asyncFn(12, 50),
      },
      10: {
        needs: ['9'],
        run: asyncFn(10, 50),
      },
      8: {
        needs: ['5', '7'],
        needsAnyOf: ['1', '6'],
        run: asyncFn(8, 100),
      },
    })

    for (let i = 4; i < 11; i++) {
      orderEvery([1, 2, 3, 11], i)
    }

    orderEvery([1, 2, 3, 11], 13)

    order(4, 5)
    order(5, 8)
    order(7, 8)
    orderSome([6], 8)
    orderEvery([4, 5, 6, 7, 8], 9)
    order(9, 10)
    expect(callSequence).not.toContain(12)
    expect(callSequence).toContain(13)
    order(13, 10)
    expect(callSequence).not.toContain(14)
  })

  test('if', async () => {
    await runPipeline({
      1: {
        if: () => true,
        run: fn(1),
      },
      2: {
        run: asyncFn(2, 50),
      },
      3: {
        deps: ['1'],
        if: (deps) => deps['1'] === Symbol(),
        run: fn(3),
      },
      4: {
        deps: ['2'],
        if: (deps) => deps['2'] === Symbol(),
        run: asyncFn(4, 50),
      },
      5: {
        deps: ['2'],
        if: (deps) => deps['2'] === Symbol(),
        run: fn(5),
      },
      6: {
        deps: ['1'],
        if: (deps) => deps['1'] === Symbol(),
        run: asyncFn(6, 50),
      },
      7: {
        deps: ['6'],
        run: fn(7),
      },
      8: {
        deps: ['1'],
        if: () => true,
        run: fn(8),
      },
    })

    expect(callSequence).toContain(1)
    expect(callSequence).toContain(2)
    expect(callSequence).toContain(8)
    expect(callSequence).not.toContain(3)
    expect(callSequence).not.toContain(4)
    expect(callSequence).not.toContain(5)
    expect(callSequence).not.toContain(6)
    expect(callSequence).not.toContain(7)
  })
})
