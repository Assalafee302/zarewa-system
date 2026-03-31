import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { motion } from "framer-motion"
import { cn } from "../../lib/utils"

const buttonVariants = {
  default: "bg-[#134e4a] text-white hover:brightness-110 shadow-lg shadow-teal-900/10",
  secondary: "bg-teal-50 text-[#134e4a] hover:bg-teal-100",
  outline: "border border-gray-200 bg-white hover:bg-gray-50 hover:text-[#134e4a]",
  ghost: "hover:bg-gray-100/50 hover:text-[#134e4a] text-gray-600",
  destructive: "bg-red-50 text-red-600 hover:bg-red-100",
}

const buttonSizes = {
  default: "h-10 px-6 py-2 pb-2.5",
  sm: "h-8 px-3 text-xs",
  lg: "h-12 px-8 text-sm",
  icon: "h-10 w-10",
}

const Button = React.forwardRef(({ className, variant = "default", size = "default", asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  
  // Create a motion version of the component if it's a standard button element.
  // Using Radix Slot with motion is tricky, so we apply motion inline or wrap if not asChild
  
  const classString = cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/30 disabled:pointer-events-none disabled:opacity-50 text-xs text-center",
    buttonVariants[variant],
    buttonSizes[size],
    className
  )

  if (asChild) {
    return <Comp className={classString} ref={ref} {...props} />
  }

  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      whileHover={{ scale: 1.01 }}
      className={classString}
      ref={ref}
      {...props}
    />
  )
})
Button.displayName = "Button"

export { Button, buttonVariants }
