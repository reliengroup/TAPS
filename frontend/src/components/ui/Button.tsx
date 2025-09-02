// src/components/ui/Button.jsx
import React from "react";
import { motion } from "framer-motion";
import { buttonHover } from "../utils/motionVariants";

interface ButtonInterface {
  children?: React.ReactNode;
  onClick?: (e:any) => void;
  className?: string;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
}

const Button = ({
  children,
  onClick,
  className = "",
  type = "button",
  disabled = false,
}: ButtonInterface) => {
  return (
    <motion.button
      disabled={disabled}
      type={type}
      onClick={onClick}
      className={`bg-primary text-white p-3 rounded-xl shadow-button transition disabled:opacity-50 ${className}`}
      {...buttonHover}
    >
      {children}
    </motion.button>
  );
};

export default Button;
