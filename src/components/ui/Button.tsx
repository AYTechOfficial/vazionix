'use client';

import * as React from 'react';
import Link from 'next/link';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/* ============================================================================
   BUTTON
   ----------------------------------------------------------------------------
   Two exports over one variant table: `Button` renders <button>, `ButtonLink`
   renders next/link. They are separate rather than a polymorphic `as` prop
   because the two element types have genuinely different required props
   (`href` vs `type`/`disabled`) and collapsing them costs more in casts than
   it saves in call sites.

   The disabled state uses explicit tokens rather than opacity: opacity stacks
   unpredictably on layered surfaces and silently drops contrast below AA.
   ========================================================================== */

export const buttonVariants = cva(
  [
    'relative inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'rounded-sm border border-transparent font-semibold',
    'transition-[background-color,border-color,color,transform,box-shadow] duration-fast ease-out',
    'active:enabled:scale-[0.97]',
    'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-text-3 disabled:border-line',
    'disabled:shadow-none disabled:scale-100',
    'aria-disabled:cursor-not-allowed aria-disabled:bg-surface-2 aria-disabled:text-text-3',
    '[&_svg]:flex-none',
  ],
  {
    variants: {
      variant: {
        /* Mint is the single interactive colour in the product. */
        primary: 'bg-mint text-text-on-mint shadow-mint hover:enabled:bg-mint-hover active:enabled:bg-mint-press',
        secondary: 'bg-surface-2 text-text border-line-strong hover:enabled:bg-surface-3',
        ghost: 'bg-transparent text-text-2 hover:enabled:bg-surface-2 hover:enabled:text-text',
        /* Danger is a tint, never a fill: a solid red button reads as the
           primary action on the screen, which it never is. */
        danger: 'bg-danger-dim text-danger border-danger-line hover:enabled:bg-danger-hover',
        /* The three-stop gradient is RESERVED — hero and final CTA band only.
           Never a normal in-app button fill. */
        gradient: 'bg-grad-signature text-on-grad border-0 shadow-mint hover:enabled:brightness-110',
      },
      size: {
        sm: 'h-[30px] px-3 text-13 [&_svg]:size-[14px]',
        md: 'h-[38px] px-4 text-14 [&_svg]:size-4',
        lg: 'h-12 px-6 text-16 rounded-md [&_svg]:size-[18px]',
        icon: 'h-[38px] w-[38px] px-0 [&_svg]:size-4',
        'icon-sm': 'h-[30px] w-[30px] px-0 [&_svg]:size-[14px]',
      },
      block: { true: 'flex w-full', false: '' },
    },
    defaultVariants: { variant: 'secondary', size: 'md', block: false },
  },
);

export type ButtonVariantProps = VariantProps<typeof buttonVariants>;

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    ButtonVariantProps {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, block, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size, block }), className)}
      {...props}
    />
  );
});

export interface ButtonLinkProps
  extends React.ComponentPropsWithoutRef<typeof Link>,
    ButtonVariantProps {}

export const ButtonLink = React.forwardRef<HTMLAnchorElement, ButtonLinkProps>(function ButtonLink(
  { className, variant, size, block, ...props },
  ref,
) {
  return (
    <Link ref={ref} className={cn(buttonVariants({ variant, size, block }), className)} {...props} />
  );
});

/* ---- ICON BUTTON -----------------------------------------------------------
   Square, borderless-until-hover chrome control. Always requires an
   `aria-label` at the type level — an icon-only control with no accessible
   name is the single most common a11y defect in a dense dashboard.        */
export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  'aria-label': string;
  size?: 'sm' | 'md';
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, size = 'md', type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'relative grid flex-none place-items-center rounded-sm border border-transparent text-text-2',
        'transition-[background-color,color,border-color] duration-fast ease-out',
        'hover:bg-surface-2 hover:text-text hover:border-line',
        'disabled:cursor-not-allowed disabled:text-text-3 disabled:hover:bg-transparent',
        size === 'sm' ? 'size-[26px] [&_svg]:size-[14px]' : 'size-[34px] [&_svg]:size-[18px]',
        className,
      )}
      {...props}
    />
  );
});
