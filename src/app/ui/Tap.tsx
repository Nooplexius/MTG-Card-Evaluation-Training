import { m } from 'motion/react';
import type { ComponentPropsWithoutRef, ReactNode, Ref } from 'react';
import { feedback, type FeedbackEvent } from '../feedback/feedback.ts';
import { useReducedMotion } from '../settings.ts';

type ButtonProps = Omit<ComponentPropsWithoutRef<'button'>, 'onClick' | 'onAnimationStart' | 'onDrag' | 'onDragStart' | 'onDragEnd'>;

export interface TapProps extends ButtonProps {
  /** Feedback event fired on activation; every control declares one. */
  fb: FeedbackEvent;
  onTap?: () => void;
  children?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
  pressScale?: number;
}

const SPRING = { type: 'spring', stiffness: 700, damping: 32, mass: 0.6 } as const;

/** The app's only button: spring press, sound and haptic through the feedback layer. */
export function Tap({ fb, onTap, children, pressScale = 0.94, type = 'button', ref, ...rest }: TapProps) {
  const reduced = useReducedMotion();
  return (
    <m.button
      ref={ref}
      type={type}
      whileTap={reduced ? { opacity: 0.75 } : { scale: pressScale }}
      transition={SPRING}
      onClick={() => {
        feedback(fb);
        onTap?.();
      }}
      {...rest}
    >
      {children}
    </m.button>
  );
}

export interface TapLinkProps extends Omit<ComponentPropsWithoutRef<'a'>, 'onAnimationStart' | 'onDrag' | 'onDragStart' | 'onDragEnd'> {
  fb?: FeedbackEvent;
  children?: ReactNode;
}

/** External or in-app link with the same feedback. */
export function TapLink({ fb = 'link.open', children, onClick, ...rest }: TapLinkProps) {
  const reduced = useReducedMotion();
  const external = typeof rest.href === 'string' && /^https?:/.test(rest.href);
  return (
    <m.a
      whileTap={reduced ? { opacity: 0.75 } : { scale: 0.97 }}
      transition={SPRING}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      onClick={(e) => {
        feedback(fb);
        onClick?.(e);
      }}
      {...rest}
    >
      {children}
    </m.a>
  );
}
