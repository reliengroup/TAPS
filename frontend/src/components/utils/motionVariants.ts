// Fade-in animation
export const fadeIn = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.6, ease: 'easeOut' } },
};

// Slide-up animation
export const slideUp = {
    hidden: { opacity: 0, y: 50 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' } },
};

// Button hover effect
export const buttonHover = {
    whileHover: { scale: 1.05, boxShadow: '0 10px 15px rgba(0, 0, 0, 0.1)' },
    whileTap: { scale: 0.95 },
};
