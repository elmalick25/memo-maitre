import React from 'react';
export default function ModuleButton({ variant = 'secondary', className = '', children, ...props }) {
  return <button type="button" className={`module-button module-button--${variant} ${className}`} {...props}>{children}</button>;
}
