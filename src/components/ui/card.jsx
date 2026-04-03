import * as React from "react"
import { motion } from "framer-motion"
import { cn } from "../../lib/utils"

const Card = React.forwardRef(({ className, animate = false, ...props }, ref) => {
  const baseClasses = cn(
    "rounded-[28px] border border-white/80 bg-white/60 backdrop-blur-3xl text-slate-950 shadow-[0_20px_60px_-32px_rgba(15,23,42,0.1),0_10px_24px_-18px_rgba(20,83,45,0.06)] overflow-hidden",
    className
  )
  if (animate) {
    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", bounce: 0.3, duration: 0.7 }}
        className={baseClasses}
        {...props}
      />
    )
  }
  return <div ref={ref} className={baseClasses} {...props} />
})
Card.displayName = "Card"

const CardHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex flex-col space-y-1.5 p-7 md:p-8", className)} {...props} />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h3 ref={ref} className={cn("text-lg sm:text-xl font-bold leading-none tracking-tight text-[#134e4a]", className)} {...props} />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-xs text-slate-500 font-medium leading-relaxed", className)} {...props} />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-7 pt-0 md:p-8 md:pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex items-center p-7 pt-0 md:p-8 md:pt-0 border-t border-slate-100/50 mt-6 pt-6", className)} {...props} />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter }
