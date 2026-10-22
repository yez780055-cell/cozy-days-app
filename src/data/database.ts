import Dexie, { type Table } from 'dexie';
import { createSeed, decorationIdentity, resolveDecoration, reviseDecoration, type TaskDecoration } from '../features/todo/decorations';

export interface Todo {
  id?: number;
  text: string;
  date: string;
  completed: boolean;
  createdAt: number;
  decoration?: TaskDecoration;
}

class LocalDatabase extends Dexie {
  todos!: Table<Todo, number>;
  constructor() {
    super('little-days');
    this.version(1).stores({ todos: '++id,date,completed,createdAt' });
    this.version(2).stores({ todos: '++id,date,completed,createdAt' }).upgrade(transaction =>
      transaction.table<Todo>('todos').toCollection().modify(todo => {
        todo.decoration = resolveDecoration(todo.text, todo.decoration, decorationIdentity(todo));
      }));
  }
}

const database = new LocalDatabase();

// Keep storage details behind this repository; views never access Dexie directly.
export const todoRepository = {
  all: () => database.transaction('rw', database.todos, async () => {
    const todos = await database.todos.orderBy('createdAt').toArray();
    for (const todo of todos) {
      const decoration = resolveDecoration(todo.text, todo.decoration, decorationIdentity(todo));
      if (JSON.stringify(todo.decoration) !== JSON.stringify(decoration)) {
        await database.todos.update(todo.id!, { decoration });
        todo.decoration = decoration;
      }
    }
    return todos;
  }),
  add: (todo: Todo) => database.todos.add({ ...todo,
    decoration: reviseDecoration(todo.text, todo.decoration ?? { seed: createSeed() }) }),
  update: (id: number, changes: Partial<Omit<Todo, 'id'>>) => database.transaction('rw', database.todos, async () => {
    const current = await database.todos.get(id);
    if (!current) throw new Error('Todo no longer exists');
    const text = changes.text ?? current.text;
    const decoration = changes.text !== undefined
      ? reviseDecoration(text, changes.decoration ?? current.decoration, decorationIdentity(current))
      : resolveDecoration(text, changes.decoration ?? current.decoration, decorationIdentity(current));
    return database.todos.update(id, { ...changes, decoration });
  }),
  remove: (id: number) => database.todos.delete(id),
};

