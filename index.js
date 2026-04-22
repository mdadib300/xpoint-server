// Imports
const express = require('express')
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express()
const port = process.env.PORT || 3000
require('dotenv').config()
const jwt = require('jsonwebtoken');
const { Resend } = require('resend');


// MiddleWares
app.use(cors())
app.use(express.json())

app.get('/', (req, res) => {
  res.send('Hello World!')
})

// Resend api key
const resend = new Resend(process.env.RESEND_API_KEY);

// Email function (Resend)
const sendOrderEmails = async (order) => {
  try {
    const cartItemsHtml = order.cartItems.map(item => `
      <tr>
          <td style="padding:5px;border:1px solid #ddd;">${item.productName}</td>
          <td style="padding:5px;border:1px solid #ddd;">${item.size || '-'}</td>
          <td style="padding:5px;border:1px solid #ddd;">${item.color || '-'}</td>
          <td style="padding:5px;border:1px solid #ddd;">${item.quantity || 1}</td>
          <td style="padding:5px;border:1px solid #ddd;">${item.price} BDT</td>
        </tr>
    `).join('');

    const orderDate = new Date(order.orderTime).toLocaleString();
    // ---------------- CUSTOMER EMAIL ----------------
    await resend.emails.send({
      from: "XPoint <info@xpointbd.com>",
      to: order.email,
      subject: "Order Placed Successfully",
      html: `
        <h3>Hi ${order.name},</h3>
        <p>Your order has been placed successfully.</p>
        <p><b>Order Time:</b> ${orderDate}</p>

        <h3>Order Details:</h3>

        <table style="border-collapse: collapse; width: 100%;">
          <thead>
            <tr>
              <th style="border:1px solid #ddd;">Product</th>
              <th style="border:1px solid #ddd;">Size</th>
              <th style="border:1px solid #ddd;">Color</th>
              <th style="border:1px solid #ddd;">Qty</th>
              <th style="border:1px solid #ddd;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${cartItemsHtml}
          </tbody>
        </table>

        <p><b>Total: ${order.amount} BDT</b></p>
        <p><b>Payment:</b> ${order.paymentMethod}</p>
        
        <p>You need to pay (bKash Payment) 200 BDT in advance when we confirm the order.</p>
        <p>bKash Payment Number: 01318551565</p>
        <p>Kindly wait for confirmation from our team.</p>
        <p>We will contact you soon.</p>
        <p>- XPoint</p>
      `,
    });

    // ---------------- ADMIN EMAIL ----------------
    await resend.emails.send({
      from: "XPoint Orders <info@xpointbd.com>",
      to: process.env.ADMIN_EMAIL,
      subject: "New Order Received",
      html: `
        <h2>Another ordrer reveived, check dashboard for further action.</h2>

        <p><b>Name:</b> ${order.name}</p>
        <p><b>Email:</b> ${order.email}</p>
        <p><b>Phone:</b> ${order.phone}</p>
        <p><b>Address:</b> ${order.address}</p>
        <p><b>Delivery:</b> ${order.deliveryLocation}</p>
        <p><b>Time:</b> ${orderDate}</p>
        <p><b>Payment:</b> ${order.paymentMethod}</p>

        <h3>Products:</h3>

        <table style="border-collapse: collapse; width: 100%;">
          <thead>
            <tr>
              <th style="border:1px solid #ddd;">Product</th>
              <th style="border:1px solid #ddd;">Size</th>
              <th style="border:1px solid #ddd;">Color</th>
              <th style="border:1px solid #ddd;">Qty</th>
              <th style="border:1px solid #ddd;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${cartItemsHtml}
          </tbody>
        </table>

        <p><b>Total: ${order.amount} BDT</b></p>
      `,
    });

    console.log("Emails sent");

  } catch (error) {
    console.error("Email error:", error);
  }
};

// -------------------- MongoDB --------------------
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@xpointcluster.j3qynmm.mongodb.net/?retryWrites=true&w=majority&appName=XpointCluster`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {

  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    ///////////////////////////////// COLLECTIONS
    const productsCollection = client.db("xpointDB").collection("productsCollection");
    const cartCollection = client.db("xpointDB").collection("cartCollection");
    const usersCollection = client.db("xpointDB").collection("usersCollection");
    const ordersCollection = client.db("xpointDB").collection("ordersCollection");

    // JSON Web Token related api
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '7d'
      });
      res.send({ token });
    })

    // Adding users to DB when they register
    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email }

      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: 'User already exists', insertedId: null })
      }

      const newUser = {
        name: user.name || "User",
        email: user.email,
        photoURL: user.photoURL || "",
        role: "user",
        phone: "",
        address: "",
        createdAt: new Date(),
      };

      const result = await usersCollection.insertOne(newUser);
      res.send(result);
    });



    // Middlewares
    const verifyToken = (req, res, next) => {
      console.log('inside verify token', req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'unauthorized access' });
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'unauthorized access' })
        }
        req.decoded = decoded;
        next();
      })
    }

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      next();
    }

    // admin check api
    app.get('/users/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' })
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === 'admin';
      }
      res.send({ admin });
    })

    // Get user info
    app.get('/users/profile', verifyToken, async (req, res) => {
      const email = req.decoded.email;

      const user = await usersCollection.findOne({ email });

      res.send(user);
    });

    // update user info
    app.patch('/users/profile', verifyToken, async (req, res) => {
      const email = req.decoded.email;

      const updatedData = req.body;

      const result = await usersCollection.updateOne(
        { email },
        {
          $set: {
            name: updatedData.name,
            photoURL: updatedData.photoURL,
            phone: updatedData.phone,
            address: updatedData.address
          }
        }
      );

      res.send(result);
    });

    // View all users in server (ADMIN ONLY)
    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      const cursor = usersCollection.find();
      const allUsers = await cursor.toArray();
      res.send(allUsers);
    })

    // Delete user from dashboard (ADMIN ONLY)
    app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    })

    // Make a user admin (DEVELOPER & ADMIN ONLY)
    app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: 'admin'
        }
      }
      const result = await usersCollection.updateOne(filter, updatedDoc);
      res.send(result);
    })

    // Displaying the products in the UI 
    app.get('/products', async (req, res) => {
      const cursor = productsCollection
        .find()
        .sort({ _id: -1 }); // latest products first

      const allProducts = await cursor.toArray();
      res.send(allProducts);
    });

    // adding products in the products server (ADMIN ONLY)
    app.post('/products', verifyToken, verifyAdmin, async (req, res) => {
      const productInfo = req.body;
      const result = await productsCollection.insertOne(productInfo);
      res.send(result);
    })

    // deleting product form the products server (ADMIN ONLY)
    app.delete('/products/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await productsCollection.deleteOne(query);
      res.send(result);
    })

    // Updating a product info (ADMIN ONLY)

    // Get single product
    app.get('/products/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await productsCollection.findOne(query);
      res.send(result);
    });

    // Update product
    app.patch('/products/:id', verifyToken, verifyAdmin, async (req, res) => {
      const product = req.body;
      const id = req.params.id;

      const filter = { _id: new ObjectId(id) };

      const updatedDoc = {
        $set: {
          name: product.name,
          category: product.category,
          price: product.price,
          discountPrice: product.discountPrice || null,
          fit: product.fit,
          sizes: product.sizes,
          colors: product.colors,
          description: product.description,
          images: product.images
        }
      };

      const result = await productsCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    // Getting products details for the Product Details page when clicked to View Details
    app.get('/products/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await productsCollection.findOne(query);
      res.send(result);
    })

    // Add to cart (with duplicate handling + default quantity)
    app.post('/cart', async (req, res) => {
      try {
        const productData = req.body;

        const query = {
          email: productData.email,
          productId: productData.productId,
          size: productData.size,
          color: productData.color
        };

        const existing = await cartCollection.findOne(query);

        // If exists → ADD selected quantity (NOT just +1)
        if (existing) {
          const result = await cartCollection.updateOne(
            { _id: existing._id },
            { $inc: { quantity: productData.quantity || 1 } }
          );

          return res.send({
            message: "quantity_updated",
            result
          });
        }

        // New item
        const cartItem = {
          ...productData,
          quantity: productData.quantity || 1,
          price: productData.price // unit price
        };

        const result = await cartCollection.insertOne(cartItem);

        res.send({
          message: "item_added",
          result
        });

      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "error" });
      }
    });


    // Get cart items (user specific)
    app.get('/cart', async (req, res) => {
      try {
        const email = req.query.email;
        const query = { email: email };

        const cursor = cartCollection.find(query);
        const allProductsInCart = await cursor.toArray();

        res.send(allProductsInCart);

      } catch (error) {
        console.error("Error fetching cart:", error);
        res.status(500).send({ message: "Failed to fetch cart" });
      }
    });


    // Delete cart item
    app.delete('/cart/:id', async (req, res) => {
      try {
        const id = req.params.id;

        const result = await cartCollection.deleteOne({
          _id: new ObjectId(id)
        });

        res.send(result);

      } catch (error) {
        console.error("Error deleting cart item:", error);
        res.status(500).send({ message: "Failed to delete item" });
      }
    });


    // Update quantity
    app.patch('/cart/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const { quantity } = req.body;

        // Validation
        if (!quantity || quantity < 1) {
          return res.status(400).send({
            message: "Quantity must be at least 1"
          });
        }

        const result = await cartCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { quantity } }
        );

        res.send(result);

      } catch (error) {
        console.error("Error updating quantity:", error);
        res.status(500).send({ message: "Failed to update quantity" });
      }
    });

    // ================= CREATE ORDER =================
    app.post('/orders', async (req, res) => {
      try {
        const orderData = req.body;

        // calculate total
        const calculatedAmount = orderData.cartItems.reduce(
          (total, item) => total + item.price * (item.quantity || 1),
          0
        );

        const order = {
          ...orderData,
          amount: calculatedAmount, // FIXED TOTAL
          status: "Pending",
          orderTime: new Date()
        };

        const result = await ordersCollection.insertOne(order);

        if (result.insertedId) {
          sendOrderEmails(order);
        }

        res.send({
          insertedId: result.insertedId,
          amount: calculatedAmount
        });

      } catch (error) {
        console.error("Order creation error:", error);
        res.status(500).send({ message: "Failed to create order" });
      }
    });


    // ================= GET USER ORDERS =================
    app.get('/orders', async (req, res) => {
      try {
        const email = req.query.email;

        const orders = await ordersCollection
          .find({ email })
          .sort({ _id: -1 })
          .toArray();

        res.send(orders);

      } catch (error) {
        console.error("Fetch orders error:", error);
        res.status(500).send({ message: "Failed to fetch orders" });
      }
    });


    // ================= CANCEL ORDER (USER) =================
    app.delete('/orders/:id', async (req, res) => {
      try {
        const id = req.params.id;

        const result = await ordersCollection.deleteOne({
          _id: new ObjectId(id)
        });

        res.send(result);

      } catch (error) {
        console.error("Cancel order error:", error);
        res.status(500).send({ message: "Failed to cancel order" });
      }
    });


    // ================= GET ALL ORDERS (ADMIN) =================
    app.get('/allOrders', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const result = await ordersCollection.find().toArray();
        res.send(result);

      } catch (error) {
        console.error("Admin fetch orders error:", error);
        res.status(500).send({ message: "Failed to fetch all orders" });
      }
    });


    // ================= UPDATE ORDER STATUS (ADMIN) =================
    app.patch('/orders/:id', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body;

        const result = await ordersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status } }
        );

        res.send(result);

      } catch (error) {
        console.error("Update order error:", error);
        res.status(500).send({ message: "Failed to update order" });
      }
    });


    // ================= DELETE ORDER (ADMIN) =================
    app.delete('/orders/:id', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const id = req.params.id;

        const result = await ordersCollection.deleteOne({
          _id: new ObjectId(id)
        });

        res.send(result);

      } catch (error) {
        console.error("Delete order error:", error);
        res.status(500).send({ message: "Failed to delete order" });
      }
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`XPoint web listening on port ${port}`)
})
