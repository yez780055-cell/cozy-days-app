import { prepareAndroidWindow } from './window';

void prepareAndroidWindow().then(() => import('../main'));
