import React from "react";
import { motion } from "framer-motion";

interface ModalInterface {
  isOpen:boolean;
  onClose:() => void;
  title:string;
  children:React.ReactNode
}

const Modal = ({ isOpen, onClose, title, children }:ModalInterface) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center  bg-black bg-opacity-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        className="bg-white p-6 rounded-xl flex flex-col items-center shadow-card w-[80vw]"
      >
        <h2 className="text-2xl font-semibold w-full   mb-4">{title}</h2>
        <div className="mb-2 w-full ">{children}</div>
        <button
          onClick={onClose}
          className="w-fit px-24 mx-auto bg-red-500 text-white p-2 rounded-xl "
        >
          Close
        </button>
      </motion.div>
    </div>
  );
};

export default Modal;
