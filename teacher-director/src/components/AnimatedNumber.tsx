import { AnimatePresence, motion } from 'motion/react';

/** Число, которое «перелистывается» при изменении. */
export function AnimatedNumber({ value, className = '' }: { value: number; className?: string }) {
  return (
    <span className={`relative inline-flex overflow-hidden tabular-nums ${className}`}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: '70%', opacity: 0, filter: 'blur(4px)' }}
          animate={{ y: '0%', opacity: 1, filter: 'blur(0px)' }}
          exit={{ y: '-70%', opacity: 0, filter: 'blur(4px)' }}
          transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
