/**
 * 可调整列宽的 Table 包装组件
 *
 * 用法与 antd Table 一致，额外支持：
 *  - 拖拽表头右侧手柄自由调节每列宽度
 *  - 列的 sorter 仍由 antd 原生支持
 *
 * 实现说明：
 *  - 通过 components.header.cell 自定义 <th>，在右侧渲染一个拖拽手柄
 *  - 拖拽时通过 onResize 回调更新对应列的 width，存于本组件 state
 *  - 不引入额外依赖，仅使用原生鼠标事件
 */
import { useState, useCallback } from 'react';
import { Table } from 'antd';

// 可拖拽调节宽度的表头单元格
function ResizableHeaderCell({ onResize, style = {}, children, ...rest }) {
  const handleMouseDown = (e) => {
    // 阻止冒泡，避免触发 antd 的列排序点击
    e.stopPropagation();
    e.preventDefault();

    const startX = e.clientX;
    const startWidth = parseInt(style.width, 10) || 120;

    const onMove = (ev) => {
      const newWidth = Math.max(60, startWidth + ev.clientX - startX);
      onResize?.(newWidth);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  return (
    <th {...rest} style={{ ...style, position: 'relative' }}>
      {children}
      <span
        onMouseDown={handleMouseDown}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: 5,
          cursor: 'col-resize',
          zIndex: 10,
          userSelect: 'none',
        }}
      />
    </th>
  );
}

export default function ResizableTable({ columns: inputColumns, ...rest }) {
  // 记录每列当前宽度，key 优先取 col.key，其次 dataIndex，最后 title
  const [widths, setWidths] = useState({});

  const handleResize = useCallback((key, width) => {
    setWidths((prev) => ({ ...prev, [key]: width }));
  }, []);

  const columns = inputColumns.map((col) => {
    const key = col.key ?? col.dataIndex ?? col.title;
    const width = widths[key] ?? col.width;
    return {
      ...col,
      width,
      onHeaderCell: () => ({
        onResize: (w) => handleResize(key, w),
      }),
    };
  });

  return (
    <Table
      columns={columns}
      components={{ header: { cell: ResizableHeaderCell } }}
      {...rest}
    />
  );
}
