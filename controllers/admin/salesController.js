const Sale = require("../../models/salesSchema");
const Order = require("../../models/orderSchema");
const Product = require("../../models/productSchema");
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');


const loadSalesPage = async (req, res) => {
  try {
      const { reportType, startDate, endDate, format } = req.query;
      let query = {};
      
      const now = new Date();
      switch (reportType) {
          case 'daily':
              query.createdOn = {
                  $gte: new Date(now.setHours(0, 0, 0, 0)),
                  $lt: new Date(now.setHours(23, 59, 59, 999))
              };
              break;
          case 'weekly':
              const weekStart = new Date(now.setDate(now.getDate()));
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
  
      query.status = 'delivered';
  
      // Fetch orders with populated product details
      const orders = await Order.find(query)
          .populate('orderedItems.product')
          .sort({ createdOn: 1 });
      
      let totalRegularPrice = 0;
      let totalFinalAmount = 0;
  
      const sales = orders.map(order => {
          // Calculate regular price considering quantity
          const orderRegularPrice = order.orderedItems.reduce((sum, item) => {
              return sum + (item.regularPrice * item.quantity);
          }, 0);

          // Calculate final amount excluding delivery charge
          const finalAmountWithoutDelivery = order.finalAmount - 50;
          
          // Track totals
          totalRegularPrice += orderRegularPrice;
          totalFinalAmount += finalAmountWithoutDelivery;
          
          // Calculate actual discount (considering quantity)
          const actualDiscount = orderRegularPrice - finalAmountWithoutDelivery;
          
          // Calculate coupon discount if applied
          const couponDiscount = order.couponApplied ? 
              (order.totalPrice - order.finalAmount) : 0;
          
          return {
              orderId: order.orderId,
              amount: finalAmountWithoutDelivery,
              discount: order.discount || 0,
              coupon: couponDiscount,
              lessPrice: actualDiscount,
              date: order.createdOn,
              items: order.orderedItems.map(item => ({
                  name: item.product.name,
                  quantity: item.quantity,
                  regularPrice: item.regularPrice,
                  finalPrice: item.finalPrice
              }))
          };
      });
      
      const salesData = {
          sales,
          totalSales: totalFinalAmount,
          orderCount: sales.length,
          discounts: sales.reduce((sum, sale) => sum + sale.discount, 0),
          coupons: sales.reduce((sum, sale) => sum + sale.coupon, 0),
          lessPrices: totalRegularPrice - totalFinalAmount
      };
  
      if (format === 'pdf') {
          return generatePDF(res, salesData);
      } else if (format === 'excel') {
          return generateExcel(res, salesData);
      }
  
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
  
 
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=sales-report.pdf");

  doc.pipe(res);

  // Add content to PDF
  doc.fontSize(20).text("Sales Report", { align: "center" });
  doc.moveDown();

  // Add summary
  doc.fontSize(14).text("Summary");
  doc.fontSize(12)
      .text(`Total Sales: Rs. ${salesData.totalSales.toLocaleString()}`)
      .text(`Total Orders: ${salesData.orderCount}`)
      .text(`Total Coupons: Rs. ${salesData.discounts.toLocaleString()}`) 
      .text(`Total Discounts: Rs. ${salesData.lessPrices.toLocaleString()}`); 

  doc.moveDown();

  
  doc.fontSize(14).text("Detailed Sales");
  let y = doc.y + 20;

  // Table headers
  const headers = ["Date", "Order ID", "Amount", "Discounts", "Coupons"];
  let x = 50;
  headers.forEach((header) => {
      doc.text(header, x, y);
      x += 100;
  });

  // Table rows
  y += 20;
  salesData.sales.forEach((sale) => {
      x = 50;
      doc.text(new Date(sale.date).toLocaleDateString(), x, y);
      x += 100;
      
      // Extract only the last 12 characters of orderId
      const shortOrderId = sale.orderId.toString().slice(-12);
      doc.text(shortOrderId, x, y);
      x += 100;

      doc.text(`Rs. ${sale.amount.toLocaleString()}`, x, y);
      x += 100;
      doc.text(`Rs. ${sale.lessPrice.toLocaleString()}`, x, y); 
      x += 100;
      doc.text(`Rs. ${sale.discount.toLocaleString()}`, x, y); 
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
    { header: 'Discounts', key: 'lessPrice', width: 15 }, 
    { header: 'Coupons', key: 'discount', width: 15 }
  ];
  
  
  worksheet.addRow(['Summary']);
  worksheet.addRow(['Total Sales', '', `Rs. ${salesData.totalSales.toLocaleString()}`]);
  worksheet.addRow(['Total Orders', '', salesData.orderCount]);
  worksheet.addRow(['Total Discounts', '', `Rs. ${salesData.discounts.toLocaleString()}`]);
  worksheet.addRow(['Total Less Prices', '', `Rs. ${salesData.lessPrices.toLocaleString()}`]);
  worksheet.addRow([]);
  
  
  worksheet.addRow(['Detailed Sales']);
  salesData.sales.forEach(sale => {
    worksheet.addRow({
      date: new Date(sale.date).toLocaleDateString(),
      orderId: sale.orderId.toString(),
      amount: `Rs. ${sale.amount.toLocaleString()}`,
      lessPrice: `Rs. ${sale.lessPrice.toLocaleString()}`, 
      discount: `Rs. ${sale.discount.toLocaleString()}` 
    });
  });
  

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=sales-report.xlsx');
  
  await workbook.xlsx.write(res);
};



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