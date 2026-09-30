import type { HTMLAttributes } from 'react';
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import { cn } from '../../lib/utils.js';
import { Button } from './button.js';

export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
export const AlertDialogPortal = AlertDialogPrimitive.Portal;
export function AlertDialogOverlay({ className, ...props }: AlertDialogPrimitive.AlertDialogOverlayProps) { return <AlertDialogPrimitive.Overlay className={cn('ui-dialog-overlay', className)} {...props} />; }
export function AlertDialogContent({ className, ...props }: AlertDialogPrimitive.AlertDialogContentProps) { return <AlertDialogPrimitive.Content className={cn('ui-dialog-content', className)} {...props} />; }
export function AlertDialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div className={cn('ui-dialog-header', className)} {...props} />; }
export function AlertDialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div className={cn('ui-dialog-footer', className)} {...props} />; }
export function AlertDialogTitle({ className, ...props }: AlertDialogPrimitive.AlertDialogTitleProps) { return <AlertDialogPrimitive.Title className={cn('ui-dialog-title', className)} {...props} />; }
export function AlertDialogDescription({ className, ...props }: AlertDialogPrimitive.AlertDialogDescriptionProps) { return <AlertDialogPrimitive.Description className={cn('ui-dialog-description', className)} {...props} />; }
export function AlertDialogCancel({ className, ...props }: AlertDialogPrimitive.AlertDialogCancelProps) { return <AlertDialogPrimitive.Cancel asChild><Button variant="outline" className={className} {...props} /></AlertDialogPrimitive.Cancel>; }
export function AlertDialogAction({ className, ...props }: AlertDialogPrimitive.AlertDialogActionProps) { return <AlertDialogPrimitive.Action asChild><Button variant="destructive" className={className} {...props} /></AlertDialogPrimitive.Action>; }
