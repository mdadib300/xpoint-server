// Imports
const express = require('express')
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express()
const port = process.env.PORT || 3000
require('dotenv').config()
const jwt = require('jsonwebtoken');
const nodemailer = require("nodemailer");


// Middleware
app.use(cors())
app.use(express.json())

app.get('/', (req, res) => {
  res.send('Hello World!')
})

// Nodemailer transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Nodemailer email sending
const sendOrderEmails = async (order) => {
  try {

    const cartItemsHtml = order.cartItems.map(item => {
      return `
        <tr>
          <td style="padding:5px;border:1px solid #ddd;">${item.productName}</td>
          <td style="padding:5px;border:1px solid #ddd;">${item.size || '-'}</td>
          <td style="padding:5px;border:1px solid #ddd;">${item.color || '-'}</td>
          <td style="padding:5px;border:1px solid #ddd;">${item.quantity || 1}</td>
          <td style="padding:5px;border:1px solid #ddd;">${item.price} BDT</td>
        </tr>
      `;
    }).join('');

    const orderDate = new Date(order.orderTime).toLocaleString();

    // ---------------- USER EMAIL ----------------
    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: order.email,
      subject: "Order Placed Successfully",
      html: `
        <h3>Hi ${order.name},</h3>
        <p>Your order has been placed successfully.</p>
        <p>Please wait for confirmation from our team.</p>

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
        
        <p>We will contact you soon.</p>
        <p>- XPoint</p>
      `,
    });

    // ---------------- ADMIN EMAIL ----------------
    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: process.env.SMTP_USER,
      subject: "New Order Placed",
      html: `
        <h2>New Order Received, check dashboard for further action.</h2>

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

    console.log("✅ Emails sent");
  } catch (error) {
    console.error("❌ Email error:", error);
  }
};

// -------------------- MongoDB --------------------
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@xpointcluster.j3qynmm.mongodb.net/?retryWrites=true&w=majority&appName=XpointCluster`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
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

    // jwt related api
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1hr' });
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



    // middleswares
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

    // Adding products to Cart
    app.post('/cart', async (req, res) => {
      const productData = req.body;
      const result = await cartCollection.insertOne(productData);
      res.send(result);
    })

    // Getting the products added to the cart (Specific user's data)
    app.get('/cart', async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const cursor = cartCollection.find(query);
      const allProductsInCart = await cursor.toArray();
      res.send(allProductsInCart);
    })

    // Delete cart item from user dashboard cart
    app.delete('/cart/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    })

    // posting orders to orders server
    app.post('/orders', async (req, res) => {
      const order = req.body;

      const result = await ordersCollection.insertOne(order);

      if (result.insertedId) {
        sendOrderEmails(order); // NodeMailer Email
      }

      res.send(result);
    });

    // getting the order info for the specific user
    app.get('/orders', async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const cursor = ordersCollection.find(query);
      const orders = await cursor.toArray();
      res.send(orders);
    })

    // cancel order from user dashboard orders
    app.delete('/orders/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await ordersCollection.deleteOne(query);
      res.send(result);
    })

    // Get all orders (ADMIN ONLY)
    app.get('/allOrders', verifyToken, verifyAdmin, async (req, res) => {
      const result = await ordersCollection.find().toArray();
      res.send(result);
    });

    // Order cancel or confirm (ADMIN ONLY)
    app.patch('/orders/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;
      const result = await ordersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: status } }
      );
      res.send(result);
    });

    // order delete (ADMIN ONLY)
    app.delete('/orders/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const result = await ordersCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
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
  console.log(`Example app listening on port ${port}`)
})
