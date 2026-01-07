export const useLayoutState = () => {
  const isAiSidebarOpen = useState('layout:ai-sidebar-open', () => false);

  const toggleAiSidebar = () => {
    isAiSidebarOpen.value = !isAiSidebarOpen.value;
  };

  return {
    isAiSidebarOpen,
    toggleAiSidebar,
  };
};
