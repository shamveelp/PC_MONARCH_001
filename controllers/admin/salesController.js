const Sale = require("../../models/salesSchema");
const Order = require("../../models/orderSchema");
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

const loadSalesPage = async (req, res) => {
    try {
      const { reportType, startDate, endDate, format } = req.query;
      let query = {};
      
      // Calculate date range based on report type
      const now = new Date();
      switch (reportType) {
        case 'daily':
          query.createdOn = {
            $gte: new Date(now.setHours(0, 0, 0, 0)),
            $lt: new Date(now.setHours(23, 59, 59, 999))
          };
          break;
        case 'weekly':
          const weekStart = new Date(now.setDate(now.getDate() - now.getDay()));
          query.createdOn = {
            $gte: new Date(weekStart.setHours(0, 0, 0, 0)),
            $lt: new Date(now)
          };
          break;
        case 'monthly':
          query.createdOn = {
            $gte: new Date(now.getFullYear(), now.getMonth(), 1),
            $lt: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
          };
          break;
        case 'custom':
          if (startDate && endDate) {
            query.createdOn = {
              $gte: new Date(startDate),
              $lt: new Date(new Date(endDate).setHours(23, 59, 59, 999))
            };
          }
          break;
      }
  
      // Only include completed orders
      query.status = 'delivered';
  
      // Fetch orders data
      const orders = await Order.find(query).sort({ createdOn: 1 });
      
      // Transform orders into sales data format
      const sales = orders.map(order => ({
        orderId: order.orderId,
        amount: order.finalAmount,
        discount: order.discount || 0,
        coupon: order.couponApplied ? (order.totalPrice - order.finalAmount - order.discount) : 0,
        date: order.createdOn
      }));
  
      // Calculate summary data
      const salesData = {
        sales,
        totalSales: sales.reduce((sum, sale) => sum + sale.amount, 0),
        orderCount: sales.length,
        discounts: sales.reduce((sum, sale) => sum + sale.discount, 0),
        coupons: sales.reduce((sum, sale) => sum + sale.coupon, 0)
      };
  
      // Handle different output formats
      if (format === 'pdf') {
        return generatePDF(res, salesData);
      } else if (format === 'excel') {
        return generateExcel(res, salesData);
      }
  
      // Render the EJS template with sales data
      res.render('sales-report', { salesData });
    } catch (error) {
      console.error('Error in loadSalesPage:', error);
      res.status(500).render('admin/pageerror', { 
        message: 'Error loading sales report', 
        error: error.message 
      });
    }
  };
  
  const generatePDF = async (res, salesData) => {
    const doc = new PDFDocument();
    
    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=sales-report.pdf');
    
    doc.pipe(res);
    
    // Add content to PDF
    doc.fontSize(20).text('Sales Report', { align: 'center' });
    doc.moveDown();
    
    // Add summary
    doc.fontSize(14).text('Summary');
    doc.fontSize(12)
      .text(`Total Sales: $${salesData.totalSales.toLocaleString()}`)
      .text(`Total Orders: ${salesData.orderCount}`)
      .text(`Total Discounts: $${salesData.discounts.toLocaleString()}`)
      .text(`Total Coupons: $${salesData.coupons.toLocaleString()}`);
    
    doc.moveDown();
    
    // Add detailed sales table
    doc.fontSize(14).text('Detailed Sales');
    let y = doc.y + 20;
    
    // Table headers
    const headers = ['Date', 'Order ID', 'Amount', 'Discount', 'Coupon'];
    let x = 50;
    headers.forEach(header => {
      doc.text(header, x, y);
      x += 100;
    });
    
    // Table rows
    y += 20;
    salesData.sales.forEach(sale => {
      x = 50;
      doc.text(new Date(sale.date).toLocaleDateString(), x, y);
      x += 100;
      doc.text(sale.orderId.toString(), x, y);
      x += 100;
      doc.text(`$${sale.amount.toLocaleString()}`, x, y);
      x += 100;
      doc.text(`$${sale.discount.toLocaleString()}`, x, y);
      x += 100;
      doc.text(`$${sale.coupon.toLocaleString()}`, x, y);
      y += 20;
    });
    
    doc.end();
  };
  
  const generateExcel = async (res, salesData) => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sales Report');
    
    // Add headers
    worksheet.columns = [
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Order ID', key: 'orderId', width: 30 },
      { header: 'Amount', key: 'amount', width: 15 },
      { header: 'Discount', key: 'discount', width: 15 },
      { header: 'Coupon', key: 'coupon', width: 15 }
    ];
    
    // Add summary
    worksheet.addRow(['Summary']);
    worksheet.addRow(['Total Sales', '', `$${salesData.totalSales.toLocaleString()}`]);
    worksheet.addRow(['Total Orders', '', salesData.orderCount]);
    worksheet.addRow(['Total Discounts', '', `$${salesData.discounts.toLocaleString()}`]);
    worksheet.addRow(['Total Coupons', '', `$${salesData.coupons.toLocaleString()}`]);
    worksheet.addRow([]);
    
    // Add sales data
    worksheet.addRow(['Detailed Sales']);
    salesData.sales.forEach(sale => {
      worksheet.addRow({
        date: new Date(sale.date).toLocaleDateString(),
        orderId: sale.orderId.toString(),
        amount: `$${sale.amount.toLocaleString()}`,
        discount: `$${sale.discount.toLocaleString()}`,
        coupon: `$${sale.coupon.toLocaleString()}`
      });
    });
    
    // Set response headers for Excel download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=sales-report.xlsx');
    
    await workbook.xlsx.write(res);
  };

// Helper function to create a sale record when an order is completed
const createSaleRecord = async (order) => {
  try {
    const sale = new Sale({
      orderId: order._id,
      amount: order.totalAmount,
      discount: order.discount || 0,
      coupon: order.couponDiscount || 0,
      date: order.orderDate || new Date()
    });
    
    await sale.save();
    return sale;
  } catch (error) {
    console.error('Error creating sale record:', error);
    throw error;
  }
};

module.exports = {
  loadSalesPage,
  createSaleRecord
};