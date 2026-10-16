import Board from '@/components/Board';
import { brief, venues } from '@/lib/data';

export default function Page() {
  return <Board venues={venues} brief={brief} />;
}
